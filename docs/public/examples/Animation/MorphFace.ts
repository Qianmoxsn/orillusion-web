import {
    Object3D,
    Scene3D,
    Engine3D,
    AtmosphericComponent,
    webGPUContext,
    HoverCameraController,
    View3D,
    DirectLight,
    KelvinUtil,
    Vector3,
    MorphTargetBlender,
    Entity,
    CameraUtil,
    MeshRenderer, PlaneGeometry
} from "@orillusion/core";
import {Stats} from "@orillusion/stats";
import {VideoMaterial, VideoTexture} from "@orillusion/media-extention";
import dat from 'dat.gui'
// import vision from '@mediapipe/tasks-vision'
// import vision from 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.0';
import vision from 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.0';

const { FaceLandmarker, FilesetResolver } = vision;

// const {FaceLandmarker, FilesetResolver} = vision;

const blendshapesMap = {};

// Sample of how to control the morphtarget animation
class Sample_MorphTarget {
    lightObj3D: Object3D;
    scene: Scene3D;
    influenceData: { [key: string]: number } = {};
    stream: MediaStream;
    videoTexture: VideoTexture;
    fakevideo: HTMLVideoElement;

    async run() {
        Engine3D.setting.shadow.shadowBound = 100;

        await Engine3D.init();

        this.scene = new Scene3D();
        this.scene.addComponent(Stats)
        let sky = this.scene.addComponent(AtmosphericComponent);

        let camera = CameraUtil.createCamera3DObject(this.scene);
        camera.perspective(60, webGPUContext.aspect, 1, 5000.0);
        camera.object3D.addComponent(HoverCameraController).setCamera(0, 0, 150);

        await this.setupCapture();
        await this.detectFace();

        this.initDirectLight();
        sky.relativeTransform = this.lightObj3D.transform;
        await this.initMorphModel();

        let view = new View3D();
        view.scene = this.scene;
        view.camera = camera;

        Engine3D.startRenderView(view);

    }

    /******** light *******/
    initDirectLight() {
        this.lightObj3D = new Object3D();
        this.lightObj3D.rotationX = 21;
        this.lightObj3D.rotationY = 108;
        this.lightObj3D.rotationZ = 10;

        let directLight = this.lightObj3D.addComponent(DirectLight);
        directLight.lightColor = KelvinUtil.color_temperature_to_rgb(5355);
        directLight.castShadow = true;
        directLight.intensity = 25;
        this.scene.addChild(this.lightObj3D);
    }

    private async initMorphModel() {
        const gui = new dat.GUI()

        // load lion model
        let model = await Engine3D.res.loadGltf('https://cdn.orillusion.com/gltfs/glb/lion.glb');
        model.y = -80.0;
        model.x = -30.0;
        this.scene.addChild(model);

        let folder = gui.addFolder('morph controller');
        // register MorphTargetBlender component
        let blendShapeComponent = model.addComponent(MorphTargetBlender);
        let targetRenderers = blendShapeComponent.cloneMorphRenderers();

        // bind influenceData to gui
        for (let key in targetRenderers) {
            this.influenceData[key] = 0.0;
            folder.add(this.influenceData, key, 0, 1, 0.01).onChange((v) => {
                this.influenceData[key] = v;
                let list = blendShapeComponent.getMorphRenderersByKey(key);
                for (let renderer of list) {
                    renderer.setMorphInfluence(key, v);
                }
            });
        }

        folder.open()
    }


    async setupCapture() {
        // Init video texture
        this.videoTexture = new VideoTexture();
        // create  video material
        let videoMat = new VideoMaterial()
        // create 2D plane to play the video
        let videoPlane = new Object3D()

        try {
            this.stream = await navigator.mediaDevices.getUserMedia({video: true});
            this.videoTexture.load(this.stream);
            this.fakevideo.srcObject = this.stream;
        } catch (error) {
            console.error('Error accessing the camera:', error);
        }

        videoMat.baseMap = this.videoTexture
        let mr = videoPlane.addComponent(MeshRenderer)
        mr.geometry = new PlaneGeometry(192, 108, 1, 1, Vector3.Z_AXIS)
        mr.material = videoMat

        this.scene.addChild(videoPlane)
    }
    async detectFace() {
        const filesetResolver = await FilesetResolver.forVisionTasks(
            "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm"
        );
        const faceLandmarker = await FaceLandmarker.createFromOptions(
            filesetResolver,
            {
                baseOptions: {
                    modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task',
                    delegate: 'GPU'
                },
                outputFaceBlendshapes: true,
                outputFacialTransformationMatrixes: true,
                runningMode: 'VIDEO',
                numFaces: 1
            });

        const results = await faceLandmarker.detectForVideo(this.fakevideo, Date.now() );
        console.log(results);
    }
}

new Sample_MorphTarget().run();