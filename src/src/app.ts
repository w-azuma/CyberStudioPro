import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
//import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';



class CyberStudioPro {
  private scene = new THREE.Scene();
  private camera!: THREE.PerspectiveCamera;
  private renderer!: THREE.WebGLRenderer;
  private composer!: EffectComposer;
  private clock = new THREE.Clock();

  
  private deckA = {
    id: 'A', platter: new THREE.Group(), velocity: 0, targetVel: 0.04,
    bpm: 128, isDragging: false, wave: new THREE.Group(), color: 0x00f2ff,
    pads: [] as THREE.Mesh[], pitch: 0
  };
  private deckB = {
    id: 'B', platter: new THREE.Group(), velocity: 0, targetVel: 0.04,
    bpm: 128, isDragging: false, wave: new THREE.Group(), color: 0xff007b,
    pads: [] as THREE.Mesh[], pitch: 0
  };

  private vuLamps: THREE.Mesh[] = [];
  private woofers: { mesh: THREE.Mesh, initialZ: number }[] = [];
  private monitorScreens: { mesh: THREE.Mesh, ctx: CanvasRenderingContext2D, tex: THREE.CanvasTexture, type: string }[] = [];
  //private knobs: THREE.Group[] = []; // 今のところ未使用、あとで光らせる予定

  // 音楽連動用。ファイルを読み込むまではnullのまま→animate側でsin波にフォールバックする
  private audioCtx: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private freqData: Uint8Array | null = null;

  constructor() {
    this.initCore();
    this.createEnvironment();
    this.createFurniture();
    this.createChassis();
    this.createDeck(this.deckA, -11);
    this.createDeck(this.deckB, 11);
    this.createMixerSection();
    this.createBackgroundAssets();
    this.setupPostProcessing();
    this.setupEventListeners();
    this.animate();
  }

  private initCore() {
    
    this.camera = new THREE.PerspectiveCamera(18, window.innerWidth / window.innerHeight, 0.1, 2000);
    this.camera.position.set(-80, 70, 130);

    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.4;
    document.body.appendChild(this.renderer.domElement);

    const controls = new OrbitControls(this.camera, this.renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.maxPolarAngle = Math.PI / 2.1; // 床に潜り込むのを防止

    this.scene.background = new THREE.Color(0x010103);
    this.scene.fog = new THREE.Fog(0x010103, 150, 400);
  }

  private createEnvironment() {
    this.scene.add(new THREE.AmbientLight(0xffffff, 0.15));

    const topLight = new THREE.RectAreaLight(0xffffff, 2, 100, 100);
    topLight.position.set(0, 50, 20);
    topLight.lookAt(0, 0, 0);
    this.scene.add(topLight);

    // 左右にネオン色のポイントライト置いてるだけ
    const addNeonSpot = (x: number, z: number, color: number) => {
      const p = new THREE.PointLight(color, 40, 60);
      p.position.set(x, 15, z);
      this.scene.add(p);
    };
    addNeonSpot(-45, -10, 0x00f2ff);
    addNeonSpot(45, -10, 0xff007b);

    const grid = new THREE.GridHelper(1000, 50, 0x222222, 0x111111);
    grid.position.y = -17.4; 
    this.scene.add(grid);
  }

  private createChassis() {
    const bodyGeo = new THREE.BoxGeometry(45, 4, 30);
    const bodyMat = new THREE.MeshStandardMaterial({
      color: 0x080808, metalness: 1, roughness: 0.2
    });
    const body = new THREE.Mesh(bodyGeo, bodyMat);
    this.scene.add(body);

    const sideGeo = new THREE.BoxGeometry(1, 4.2, 30.2);
    const sideMat = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.1 });
    const sideL = new THREE.Mesh(sideGeo, sideMat);
    sideL.position.x = -22.5;
    const sideR = sideL.clone();
    sideR.position.x = 22.5;
    this.scene.add(sideL, sideR);
  }

  private createDeck(deck: any, x: number) {
    const group = new THREE.Group();
    group.position.set(x, 2.1, 0);
    this.scene.add(group);

    // platter本体、4層重ねてるのは厚み出したかっただけ
    const platterGroup = new THREE.Group();
    const platMat = new THREE.MeshStandardMaterial({
      color: 0x111111, metalness: 0.9, roughness: 0.1
    });

    for (let i = 0; i < 4; i++) {
      const c = new THREE.Mesh(new THREE.CylinderGeometry(5.2 - i * 0.05, 5.2 - i * 0.05, 0.2, 64), platMat);
      c.position.y = i * 0.2;
      platterGroup.add(c);
    }

    const centerDisplay = new THREE.Mesh(
      new THREE.CylinderGeometry(1.8, 1.8, 0.1, 32),
      new THREE.MeshStandardMaterial({ color: 0x000000, emissive: deck.color, emissiveIntensity: 0.5 })
    );
    centerDisplay.position.y = 0.8;
    platterGroup.add(centerDisplay);

    group.add(platterGroup);
    deck.platter = platterGroup;

    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(5.5, 0.08, 16, 100),
      new THREE.MeshBasicMaterial({ color: deck.color })
    );
    ring.rotation.x = Math.PI / 2;
    group.add(ring);

    // ピッチフェーダー（見た目だけ、機能は繋いでない）
    const faderBase = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.1, 9), new THREE.MeshStandardMaterial({ color: 0x000000 }));
    faderBase.position.set(8, 0, 0);
    group.add(faderBase);
    const faderKnob = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.8, 0.6), new THREE.MeshStandardMaterial({ color: 0xcccccc, metalness: 1 }));
    faderKnob.position.set(8, 0.4, 2);
    group.add(faderKnob);

    // 8個のパフォーマンスパッド、1〜8キーで光る
    for (let i = 0; i < 8; i++) {
      const pad = new THREE.Mesh(
        new THREE.BoxGeometry(1.1, 0.3, 1.1),
        new THREE.MeshStandardMaterial({ color: 0x222222, emissive: deck.color, emissiveIntensity: 0.2 })
      );
      pad.position.set(-6.5 + (i % 4) * 1.35, 0.1, 8 + Math.floor(i / 4) * 1.35);
      group.add(pad);
      deck.pads.push(pad);
    }

    this.createWaveformUI(group, deck);
  }

  private createWaveformUI(parent: THREE.Group, deck: any) {
    const bars = new THREE.Group();
    for (let i = 0; i < 60; i++) {
      const b = new THREE.Mesh(
        new THREE.BoxGeometry(0.12, 2.5, 0.12),
        new THREE.MeshStandardMaterial({ color: deck.color, emissive: deck.color, emissiveIntensity: 2 })
      );
      b.position.set(-3.8 + i * 0.14, 1, -10);
      bars.add(b);
    }
    parent.add(bars);
    deck.wave = bars;
  }

  private createMixerSection() {
    const mixer = new THREE.Group();
    mixer.position.set(0, 2.1, 0);
    this.scene.add(mixer);

    const createFader = (x: number) => {
      const f = new THREE.Mesh(new THREE.BoxGeometry(1.2, 1.8, 0.6), new THREE.MeshStandardMaterial({ color: 0xeeeeee, metalness: 1 }));
      f.position.set(x, 0.5, 8);
      mixer.add(f);
    };
    createFader(-2.5);
    createFader(2.5);

    const cf = new THREE.Mesh(new THREE.BoxGeometry(1.5, 1, 0.8), new THREE.MeshStandardMaterial({ color: 0xdddddd, metalness: 1 }));
    cf.position.set(0, 0.2, 12);
    mixer.add(cf);

    // EQノブ、4段 x 左右
    const knobGeo = new THREE.CylinderGeometry(0.4, 0.45, 0.7, 32);
    const knobMat = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, metalness: 0.8, roughness: 0.4 });
    for (let row = 0; row < 4; row++) {
      for (let col = -1; col <= 1; col += 2) {
        if (col === 0) continue; // 中央は使わない、for文使い回してるだけ
        const k = new THREE.Mesh(knobGeo, knobMat);
        k.position.set(col * 2.5, 0.4, -4 + row * 2.2);
        mixer.add(k);
        const indicator = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.1, 0.4), new THREE.MeshBasicMaterial({ color: 0x00f2ff }));
        indicator.position.set(col * 2.5, 0.8, -4.2 + row * 2.2);
        mixer.add(indicator);
      }
    }

    // VUメーター、左右22個ずつ
    for (let side = -1; side <= 1; side += 2) {
      if (side === 0) continue;
      for (let i = 0; i < 22; i++) {
        const lamp = new THREE.Mesh(
          new THREE.BoxGeometry(0.6, 0.15, 0.3),
          new THREE.MeshStandardMaterial({ color: 0x111111 })
        );
        lamp.position.set(side * 0.7, 0, -2 + i * 0.45);
        mixer.add(lamp);
        this.vuLamps.push(lamp);
      }
    }
  }

  private createFurniture() {
    const deskMat = new THREE.MeshStandardMaterial({ color: 0x0a0a0a, metalness: 0.9, roughness: 0.05 });
    const top = new THREE.Mesh(new THREE.BoxGeometry(130, 2, 65), deskMat);
    top.position.y = -2;
    this.scene.add(top);

    this.addSpeaker(-45, 0x00f2ff);
    this.addSpeaker(45, 0xff007b);

    this.addTripleMonitors();
  }

  private addSpeaker(x: number, color: number) {
    const group = new THREE.Group();
    const box = new THREE.Mesh(new THREE.BoxGeometry(16, 28, 16), new THREE.MeshStandardMaterial({ color: 0x050505, metalness: 0.8 }));
    group.add(box);

    const wGeo = new THREE.CylinderGeometry(6, 6, 2, 32);
    const wMat = new THREE.MeshStandardMaterial({ color: 0x151515, roughness: 0.3 });
    const woofer = new THREE.Mesh(wGeo, wMat);
    woofer.rotation.x = Math.PI / 2;
    woofer.position.set(0, -5, 7.5);
    group.add(woofer);
    this.woofers.push({ mesh: woofer, initialZ: 7.5 });

    const ring = new THREE.Mesh(new THREE.TorusGeometry(6.3, 0.2, 16, 64), new THREE.MeshBasicMaterial({ color: color }));
    ring.position.set(0, -5, 8.1);
    group.add(ring);

    group.position.set(x, 12, -15);
    group.lookAt(0, 5, 50); // 適当にカメラ方向っぽく向けてるだけ、正確な計算ではない
    this.scene.add(group);
  }

  private addTripleMonitors() {
    const screenTypes = ['mixer', 'waves', 'data'];
    [-1, 0, 1].forEach((pos, idx) => {
      const mGroup = new THREE.Group();
      const frame = new THREE.Mesh(new THREE.BoxGeometry(38, 22, 1.5), new THREE.MeshStandardMaterial({ color: 0x000000 }));
      mGroup.add(frame);

      const canvas = document.createElement('canvas');
      canvas.width = 1024;
      canvas.height = 512;
      const ctx = canvas.getContext('2d')!;
      const tex = new THREE.CanvasTexture(canvas);

      const screen = new THREE.Mesh(
        new THREE.PlaneGeometry(36, 20),
        new THREE.MeshStandardMaterial({
          map: tex, emissiveMap: tex, emissive: 0xffffff, emissiveIntensity: 1.1
        })
      );
      screen.position.z = 0.8;
      mGroup.add(screen);
      this.monitorScreens.push({ mesh: screen, ctx, tex, type: screenTypes[idx] });

      mGroup.position.set(pos * 40, 28, -40);
      mGroup.rotation.y = -pos * 0.4;
      this.scene.add(mGroup);
    });
  }

  private createBackgroundAssets() {
    // 背景の垂れ下がったケーブル、意味はないけど寂しいので追加
    const curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(-40, 0, -5),
      new THREE.Vector3(-55, -15, -15),
      new THREE.Vector3(0, -18, -40),
      new THREE.Vector3(55, -15, -15),
      new THREE.Vector3(40, 0, -5),
    ]);
    const cable = new THREE.Mesh(new THREE.TubeGeometry(curve, 64, 0.3, 8, false), new THREE.MeshStandardMaterial({ color: 0x050505 }));
    this.scene.add(cable);
  }

  private updateScreens(time: number) {
    this.monitorScreens.forEach(s => {
      const { ctx, tex, type } = s;
      const w = 1024, h = 512;
      ctx.fillStyle = '#020205';
      ctx.fillRect(0, 0, w, h);

      ctx.strokeStyle = '#111122';
      ctx.lineWidth = 1;
      for (let i = 0; i < w; i += 64) {
        ctx.beginPath();
        ctx.moveTo(i, 0);
        ctx.lineTo(i, h);
        ctx.stroke();
      }

      if (type === 'waves') {
        ctx.strokeStyle = '#00f2ff';
        ctx.lineWidth = 5;
        ctx.beginPath();
        for (let x = 0; x < w; x++) {
          const y = h / 2 + Math.sin(x * 0.01 + time * 10) * 100 * Math.sin(time * 2);
          x === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
        }
        ctx.stroke();
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 40px Arial';
        ctx.fillText("CHANNEL MASTER v3.0 - STABLE", 50, 80);
      } else if (type === 'mixer') {
        ctx.fillStyle = '#ff007b';
        for (let i = 0; i < 16; i++) {
          const v = Math.abs(Math.sin(time * 5 + i)) * 300;
          ctx.fillRect(100 + i * 50, h - v - 50, 30, v);
        }
      } else {
        // data画面、正直あんまり凝ってない
        ctx.fillStyle = '#00f2ff';
        ctx.font = '80px monospace';
        ctx.fillText(`BPM: 128.00`, w / 2 - 200, h / 2);
        ctx.font = '30px Arial';
        ctx.fillText("SYSTEM OK // LATENCY 2ms", w / 2 - 200, h / 2 + 80);
      }
      tex.needsUpdate = true;
    });
  }

  private setupPostProcessing() {
    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));

    // bloomの強さは何度か調整してこの値に落ち着いた(0.5, 0.4, 0.85)
    const bloom = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 0.5, 0.4, 0.85);
    this.composer.addPass(bloom);
  }

  // 音楽ファイルを選ばせるUI。index.html側は一切いじらず、ここでDOMを組み立てる
  private setupAudioUI() {
    const wrap = document.createElement('div');
    wrap.style.cssText = 'position:fixed;top:16px;left:16px;z-index:10;font-family:sans-serif;';

    const label = document.createElement('label');
    label.textContent = '♪ 音楽ファイルを選択 : ';
    label.style.cssText = 'color:#00f2ff;font-size:13px;';

    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'audio/*';
    input.style.cssText = 'color:#fff;font-size:12px;';

    input.addEventListener('change', (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      this.startAudio(file);
    });

    label.appendChild(input);
    wrap.appendChild(label);
    document.body.appendChild(wrap);
  }

  private startAudio(file: File) {
    // 前の曲が鳴ってたら止める（作りかけの状態で放置すると音が重なるので念のため）
    if (this.audioCtx) this.audioCtx.close();

    const audioEl = new Audio(URL.createObjectURL(file));
    audioEl.loop = true;

    this.audioCtx = new AudioContext();
    const srcNode = this.audioCtx.createMediaElementSource(audioEl);
    this.analyser = this.audioCtx.createAnalyser();
    this.analyser.fftSize = 256; // 60本の波形バーに対して細かすぎず荒すぎずの値、試して決めた

    srcNode.connect(this.analyser);
    this.analyser.connect(this.audioCtx.destination);
    this.freqData = new Uint8Array(this.analyser.frequencyBinCount);

    audioEl.play();
  }

  // low〜highのビン範囲を平均して0〜1に正規化。低音域だけ・高音域だけを狙って取るのに使う
  private getAudioLevel(low: number, high: number): number {
    if (!this.analyser || !this.freqData) return 0;
    // TSバージョンによってUint8Arrayのバッファ型で怒られることがあるので明示キャスト
    this.analyser.getByteFrequencyData(this.freqData as Uint8Array<ArrayBuffer>);
    let sum = 0;
    for (let i = low; i < high; i++) sum += this.freqData[i];
    return sum / (high - low) / 255;
  }

  private setupEventListeners() {
    this.setupAudioUI();

    window.addEventListener('mousedown', (e) => {
      const x = (e.clientX / window.innerWidth) * 2 - 1;
      if (x < 0) this.deckA.isDragging = true;
      else this.deckB.isDragging = true;
    });
    window.addEventListener('mouseup', () => {
      this.deckA.isDragging = false;
      this.deckB.isDragging = false;
    });
    window.addEventListener('mousemove', (e) => {
      if (this.deckA.isDragging) this.deckA.velocity += e.movementX * 0.02;
      if (this.deckB.isDragging) this.deckB.velocity += e.movementX * 0.02;
    });

    // 1〜8キーでパッドを光らせる。デッキAだけ対応、Bはそのうち
    window.addEventListener('keydown', (e) => {
      const key = parseInt(e.key);
      if (key >= 1 && key <= 8) {
        const pad = this.deckA.pads[key - 1];
        (pad.material as THREE.MeshStandardMaterial).emissiveIntensity = 5;
        setTimeout(() => (pad.material as THREE.MeshStandardMaterial).emissiveIntensity = 0.2, 100);
      }
    });
  }

  private animate = () => {
    requestAnimationFrame(this.animate);
    const elapsed = this.clock.getElapsedTime();

    this.updateScreens(elapsed);

    const audioOn = !!this.analyser;

    [this.deckA, this.deckB].forEach((deck, idx) => {
      if (!deck.isDragging) deck.velocity = THREE.MathUtils.lerp(deck.velocity, deck.targetVel, 0.05);
      deck.platter.rotation.y += deck.velocity;
      deck.wave.children.forEach((bar: any, i: number) => {
        // 音声あり: 各バーに1ビンずつ割り当て（60本 vs freqBinCount 128なので概ね1:1で足りる）
        // 音声なし: 元のsin波デモ動作にフォールバック
        const v = audioOn
          ? this.getAudioLevel(i, i + 1)
          : Math.sin(elapsed * 15 + i * 0.2 + idx) * 0.5 + 0.5;
        bar.scale.y = 0.1 + v * (1 + Math.abs(deck.velocity) * 20);
      });
    });

    // ウーファーの鼓動。音声接続時は低音域(0〜8ビン)の平均をキック代わりに使う
    const beat = audioOn
      ? Math.pow(this.getAudioLevel(0, 8), 2)
      : Math.pow(Math.sin(elapsed * 6.7), 10);
    this.woofers.forEach(w => w.mesh.position.z = w.initialZ + beat * 1.5);

    this.vuLamps.forEach((l, i) => {
      const local = i % 22;
      const level = audioOn
        ? this.getAudioLevel(local, local + 1) * 22
        : (Math.sin(elapsed * 20 + i * 0.1) * 0.5 + 0.5) * 22;
      const noise = level;
      const mat = l.material as THREE.MeshStandardMaterial;
      if (local < noise) {
        const col = local > 18 ? 0xff0000 : (local > 14 ? 0xffff00 : 0x00ff00);
        mat.color.setHex(col);
        mat.emissive.setHex(col);
        mat.emissiveIntensity = 2;
      } else {
        mat.color.setHex(0x111111);
        mat.emissiveIntensity = 0;
      }
    });

    this.composer.render();
  }
}

new CyberStudioPro();
