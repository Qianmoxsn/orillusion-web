<Logo :animation="false"></Logo>

---

`Orillusion` 引擎是一款完全支持 [WebGPU](https://www.orillusion.com/webgpu.html) 标准的轻量级渲染引擎。基于最新的 `Web` 图形API标准，我们做了大量的探索和尝试，实现了很多曾经在 `Web` 中很难实现或者根本实现不了的技术和功能。我们自己从以下几个方面对引擎的架构和功能特点做出了总结。

## WebGPU 支持
引擎底层没有考虑到兼容现有的 [WebGL](https://www.khronos.org/webgl/) 标准，而是完全向最新的 `WebGPU` 标准看起。随着`WebGPU API` 和 `WGSL` 的持续发展，我们也将快速更新迭代引擎底层 `WebGPU` 的计算和渲染能力，提升引擎性能优势。

## ECS 组件式系统
引擎框架发展至今，业内普遍开始采用 `组合优于继承` 的开发设计原则。因此，我们放弃继承式架构，而选择了最新的 [ECS](https://wikipedia.org/wiki/Entity_component_system) 组件式架构做为引擎的成体设计思路。消除了继承模式中的继承链复杂，功能交织的问题，通过解耦，封装和模块化重新的设计，开发者可以更灵活的进行功能组合及扩展。

## 面向数据（DO）设计
严格的 `ECS` 架构要求，要求 `Entity`, `Component` 和 `System` 要完全独立分隔。这种设计范式下对于数据优化和性能是可以得到更大的提升。但是同时也会带来很大的负面问题就是开发成本和难度非常大。因此我们考虑到开发者的使用难度，以及Web开发者的开发习惯。我们采用了 `ECS` 中核心 `Data Oritented (面向数据开发)` 理念，实现按需 `DO` 的结构。目前的使用方式为，在 `GPU` 中创建连续内存，同时在 `CPU` 和 `GPU` 之间通过内存映射的方式，实现数据的连续高效传递，减少 `CPU` 和 `GPU` 之间数据交换的等待时间和次数。既能提高缓存命中率，实现性能的提升，也同时可以保证整体引擎开发和使用的易用性。

<!-- ## WASM 加速
`JavaScript` 在 [V8](https://v8.dev/) 内核中运行效率已经非常高了，但是和原生环境还有些差距。3D场景中很多复杂的数学计算逻辑仍然需要 `CPU` 来运算，为了提高效率我们引入了 [WASM](https://webassembly.org/) 支持，将大量的 `CPU` 计算需求交给原生的计算模块，不再依靠 `JS` 线程来完成，可以极大的提高 `CPU` 利用率和运算性能。 -->

<!-- ## 集群前向渲染
普通的前向渲染是最为简单的渲染管线。但是它的计算复杂度为 `M x N`（M为物件数目，N为动态光源数目），不适合动态光源复杂的场景，而且会有大量的 `Overdraw`。我们的做法是，首先实现 `Tile Forward Rendering/Forward+ Rendering` 渲染管线，在二维的屏幕空间进行 `Tile` 划分，通过预计算好的深度信息，通过 `Compute Shader` 完成对 `Tile` 中没有贡献的光源进行剔除，减少计算压力。再进一步，我们采用 `Cluster Light Culling` 的技术，在深度方向上也同样进行一次划分，进一步缩小光照的影响范围，实现了对动态多光源场景很好的渲染效果。 -->

## 集群光照剔除
这里也就是 `Clustered Forward Rendering` 中的光照剔除方案。在二维 `(Tile)` 和三维 `(Cluster)` 同时对于空间进行块状分割，最后只计算对这个块状空间有光照贡献的光源，完成无效光源的剔除过程，提高计算效率。基于 `WebGL` 的 `Uniform Buffer` 有很多限制，光源数量支持比较少，一般在10个以内。`WebGPU` 有了具备了 `Storage Buffer`，基本上就是直接对标 `GPU` 显存的限制。只要做好自身的内存管理和优化，就可以充分利用GPU的能力，实现多光源渲染的场景。

## 物理仿真系统
我们首先接入了 `ammo.js`，做为CPU端的基本物理仿真功能实现。同时我们正在搭建基于`Compute Shader` 的 `GPU` 端物理仿真引擎，包括粒子，流体，软体，刚体，布料等。在`WebGL` 时期，只能依靠顶点和纹理的数据结构进行相应的计算过程，实现复杂，效率不高。通过`WebGPU` 的 `Compute Shader`，内存和数据结构更加灵活，给了我们很大的想象空间。目前已经实现了很多优秀的物理仿真案例，更多更强的物理仿真的功能正在快速迭代过程中。

## 基于物理的材质渲染
我们实现了最基本的 `Blinn-phong` 模型材质渲染。为了增加更好的真实感渲染效果，我们依靠 `HDR Light` ，也实现了基于 `PBR (Physically-based rendering)` 的材质渲染。也是目前主流引擎的标配了，是一项比较普及的基本引擎要求。

## 动态漫反射全局光照
`DDGI (Dynamic Diffuse Global Illumination)` 算法是一个基于 `Probe` 的全局光照算法。需要在空间中摆放许多个的 `Probe`，并进行分组，每组 `Probe` 打包成一个 `DDGI Volume`。`Compute Shader` 来计算每个`Probe` 的辐照度（光照信息）和 `G-buffer（几何信息）`，这些信息从球面映射到八面体再映射到正方形来存储。当需要着色时，只需要查看着色点周围的 `probe` 中存储的光照和几何信息来计算着色点的光照信息。将 `Volume` 绑定到摄像机上跟随移动，`Volume` 内的物体会应用间接光照，即被间接光照亮。从渲染效果等方面综合考量，目前我们设置的最大间接光源数量是32个。

<!-- ## GPU骨骼动画
基于 `WebGL` 框架，蒙皮动画在顶点着色器中是容易实现的。骨骼动画一般都是在 `JavaScript` 中计算，然后把数据传递到 `GPU` 完成渲染。由于具备了 `WebGPU` 的 `Compute Shader`，更灵活的数据结构允许我们将骨骼动画的计算过程转移到 `GPU` 当中，大幅度提高了计算效率和性能。当然我们同时也提供给客户基于 `CPU` 的骨骼动画方案，用户可以按需选择。 -->

<!-- ## 视锥体剔除
视锥剔除的目的就是只需要渲染摄像头视椎体内部的物体。目前渲染管线的 `GPU` 裁剪阶段会完成自动剔除功能，但是在之前 `CPU` 仍然会通过 `DrawCall` 把信息传递给 `GPU` 的 `Vertex Shader`，这些视锥体之外的信息也会参与到很多计算环节中。我们采用视椎体出方案就是在最源头解决这些额外信息的计算问题。首先为模型建立 `AABB` 包围盒，依靠 `DO` 的优势，完成索引数据从 `CPU` 向 `GPU` 的共享传输，然后通过 `Compute Shader` 来计算视锥体和包围体是否相交，相交就提交 `DrawCall`，反之不进行绘制。这样可以极大的提高渲染效率，减少额外的计算消耗。 -->

## 丰富的后处理特效
`后处理特效` 是使得渲染内容氛围敢提升的重要处理方式。我们基于 `WebGPU` 的 `compute shader`，目前实现了 `HDR 泛光`，`屏幕空间反射`, `环境光屏蔽` 等常用的后处理效果。依靠 `WebGPU` 的通用计算能力可以更高效的利用 `GPU` 计算优势，实现非常好的效果。

例如，[屏幕空间反射 (SSR)](/guide/advanced/post_ssr) 是基于屏幕空间大小来实现反射效果。相比平面反射，可以实现场景任意表面反射，而且不需要额外的 `DrawCall`，是非常流行的实时反射技术。首先，屏幕空间物体的每个像素需要计算其反射向量。然后，需要判断屏幕空间的 `Ray Marching` 坐标的深度和深度缓存中存储的物体深度是否相交。最后，适当的调节粗糙度，把交点的颜色做为反射颜色完成着色。这个过程中的计算过程，我们都通过 `WebGPU` 的 `Compute Shader` 来实现，避免了 `CPU` 的消耗。最终在浏览器中可以呈现出非常良好的反射效果。

更多扩展后处理特效请参考 [PostEffects](/guide/advanced/posteffect)