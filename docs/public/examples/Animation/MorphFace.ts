import { AtmosphericComponent, CameraUtil, DirectLight, Engine3D, HoverCameraController, KelvinUtil, Matrix4, MeshRenderer, MorphTargetBlender, Object3D, PlaneGeometry, Quaternion, Scene3D, Vector3, View3D, webGPUContext } from '@orillusion/core'
import { Stats } from '@orillusion/stats'
import { VideoMaterial, VideoTexture } from '@orillusion/media-extention'
import dat from 'dat.gui'
import vision from 'tasks-vision'

const { FaceLandmarker, FilesetResolver } = vision

// Sample of how to control the morphtarget animation
class Sample_MorphTarget {
    lightObj3D: Object3D
    scene: Scene3D
    videoTexture: VideoTexture
    influenceData: { [key: string]: number } = {}
    htmlVideo: HTMLVideoElement
    stream: MediaStream
    blendShapeComponent: MorphTargetBlender
    targetRenderers: { [p: string]: SkinnedMeshRenderer2[] }
    lastVideoTime: number = -1
    faceLandmarker: FaceLandmarker
    filesetResolver: FilesetResolver
    guiFolder: dat.GUI
    model: Object3D

    async run() {
        Engine3D.setting.shadow.shadowBound = 100

        await Engine3D.init()

        this.scene = new Scene3D()
        this.scene.addComponent(Stats)
        let sky = this.scene.addComponent(AtmosphericComponent)

        let camera = CameraUtil.createCamera3DObject(this.scene)
        camera.perspective(60, webGPUContext.aspect, 1, 5000.0)
        camera.object3D.addComponent(HoverCameraController).setCamera(0, 0, 150)

        this.initDirectLight()
        sky.relativeTransform = this.lightObj3D.transform

        let view = new View3D()
        view.scene = this.scene
        view.camera = camera

        await this.initMorphModel()

        await this.setupCapture()

        Engine3D.startRenderView(view)

        await this.setupPredict()
        await this.detectFace()
    }

    /******** light *******/
    initDirectLight() {
        this.lightObj3D = new Object3D()
        this.lightObj3D.rotationX = 21
        this.lightObj3D.rotationY = 108
        this.lightObj3D.rotationZ = 10

        let directLight = this.lightObj3D.addComponent(DirectLight)
        directLight.lightColor = KelvinUtil.color_temperature_to_rgb(5355)
        directLight.castShadow = true
        directLight.intensity = 25
        this.scene.addChild(this.lightObj3D)
    }

    private async initMorphModel() {
        const gui = new dat.GUI()

        // load lion model
        let model = await Engine3D.res.loadGltf('https://cdn.orillusion.com/gltfs/glb/lion.glb')
        model.y = -80.0
        model.x = -30.0
        this.scene.addChild(model)
        this.model = model

        let folder = gui.addFolder('morph controller')
        // register MorphTargetBlender component
        this.blendShapeComponent = model.addComponent(MorphTargetBlender)
        this.targetRenderers = this.blendShapeComponent.cloneMorphRenderers()

        // bind influenceData to gui

        for (let key in this.targetRenderers) {
            this.influenceData[key] = 0.0
            folder.add(this.influenceData, key, 0, 1, 0.01).onChange((v) => {
                this.influenceData[key] = v
                let list = this.blendShapeComponent.getMorphRenderersByKey(key)
                for (let renderer of list) {
                    renderer.setMorphInfluence(key, v)
                }
                console.log(this.targetRenderers)
            })
        }

        this.guiFolder = folder
        folder.open()
    }

    async setupCapture() {
        // Init video texture
        this.videoTexture = new VideoTexture()
        // create  video material
        let videoMat = new VideoMaterial()
        // create 2D plane to play the video
        let videoPlane = new Object3D()
        videoPlane.x = 50
        videoPlane.y = 50
        videoPlane.z = -100

        try {
            this.stream = await navigator.mediaDevices.getUserMedia({ video: true })

            this.htmlVideo = document.createElement('video')
            this.htmlVideo.height = 200
            this.htmlVideo.setAttribute('style', 'position:fixed;left:0;bottom:0;z-index:0')
            this.htmlVideo.srcObject = this.stream
            this.htmlVideo.play()

            this.videoTexture.load(this.stream)
        } catch (error) {
            console.error('Error accessing the camera:', error)
        }

        videoMat.baseMap = this.videoTexture
        let mr = videoPlane.addComponent(MeshRenderer)
        mr.geometry = new PlaneGeometry(192, 108, 1, 1, Vector3.Z_AXIS)
        mr.material = videoMat

        // this.scene.addChild(videoPlane)
        document.body.appendChild(this.htmlVideo)
    }

    async setupPredict() {
        const filesetResolver = await FilesetResolver.forVisionTasks('https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm')
        const faceLandmarker = await FaceLandmarker.createFromOptions(filesetResolver, {
            baseOptions: {
                modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task',
                delegate: 'GPU'
            },
            outputFaceBlendshapes: true,
            outputFacialTransformationMatrixes: true,
            runningMode: 'VIDEO',
            numFaces: 1
        })
        this.faceLandmarker = faceLandmarker
        this.filesetResolver = filesetResolver
    }

    async detectFace() {
        const faceLandmarker = this.faceLandmarker
        // const filesetResolver = this.filesetResolver;

        if (this.htmlVideo.currentTime !== this.lastVideoTime) {
            const results = await faceLandmarker.detectForVideo(this.htmlVideo, Date.now())
            await this.face2Morph(results)
            await this.face2Transform(results)
            this.lastVideoTime = this.htmlVideo.currentTime
        }

        requestAnimationFrame(() => {
            this.detectFace()
        })
    }

    async face2Morph(results) {
        if (results.facialTransformationMatrixes.length > 0) {
            const faceBlendshapes = results.faceBlendshapes[0].categories

            let Lefteye = faceBlendshapes[9].score
            let Righteye = faceBlendshapes[10].score
            let Mouth = faceBlendshapes[25].score

            this.influenceData['mouth'] = Mouth * 1.1
            this.influenceData['leftEye'] = Lefteye * 1.8
            this.influenceData['rightEye'] = Righteye * 1.8
            this.influenceData['tongue'] = Mouth * 1.1
            // console.log(this.influenceData)

            this.guiFolder.updateDisplay()

            for (let key in this.targetRenderers) {
                let list = this.blendShapeComponent.getMorphRenderersByKey(key)
                list[0].setMorphInfluence(key, this.influenceData[key])
            }
        }
    }

    async face2Transform(results) {
        if (results.facialTransformationMatrixes.length > 0) {
            const faceTransMat = results.facialTransformationMatrixes[0].data
            // console.log(faceTransMat);
            let vec3 = new Vector3()
            let mat4 = new Matrix4()

            vec3.set(faceTransMat[12], faceTransMat[13], faceTransMat[14], faceTransMat[15])
            vec3.multiplyScalar(1)
            // this.model.transform.localPosition = vec3;

            vec3.set(faceTransMat[8], faceTransMat[9], faceTransMat[10], faceTransMat[11])
            mat4.copyColFrom(2, vec3)
            vec3.set(faceTransMat[4], faceTransMat[5], faceTransMat[6], faceTransMat[7])
            mat4.copyColFrom(1, vec3)
            vec3.set(faceTransMat[0], faceTransMat[1], faceTransMat[2], faceTransMat[3])
            mat4.copyColFrom(0, vec3)

            mat4.transpose()

            let q = new Quaternion()
            q.fromMatrix(mat4)
            console.log(q)
            this.model.localQuaternion = q
        }
    }
}

new Sample_MorphTarget().run()
