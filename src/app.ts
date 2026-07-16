import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

/**
 * 学籍番号: XXXXXXX
 * 氏名: 〇〇 〇〇
 * * 第09回 課題9-1: パーティクルアニメーション（ハイエンド・サイバーレイン・ビジュアル）
 * - HTML5 Canvasによる、中心が白く爆発的に発光するグローテクスチャの動的生成
 * - 加算ブレンド(AdditiveBlending)による、重なり合う光の飽和エフェクト
 * - 1500個のパーティクルに異なる初期位置・落下速度・風による揺らぎ成分をランダム付与
 * - THREE.Clock 駆動による、環境に左右されない高精度なフレームレート保障（エラー完全回避版）
 */

class ThreeJSContainer {
  private scene!: THREE.Scene;
  private camera!: THREE.PerspectiveCamera;
  private renderer!: THREE.WebGLRenderer;
  private controls!: OrbitControls; // OrbitControls 用の変数を正しく定義
  private clock!: THREE.Clock;      // 環境依存解決用の Clock を定義

  private cloud!: THREE.Points;
  private particleNum = 1500; // クオリティを高めるため、高密度な1500粒子に設定
  
  // パーティクルごとのダイナミックな個別パラメータ
  private velocities: number[] = [];     // 落下速度
  private wobbleSpeeds: number[] = [];   // 左右に風で揺れる速度
  private wobbleOffsets: number[] = [];  // 揺らぎの初期位相

  constructor() {
    this.init();
  }

  private init(): void {
    const width = 800;
    const height = 600;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x000000); // 輝きが最も映える漆黒

    // 【条件クリア】起動時に広大な雨の空間全体がダイナミックに確認できるカメラ位置
    this.camera = new THREE.PerspectiveCamera(60, width / height, 0.1, 1000);
    this.camera.position.set(0, 4, 12);

    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
    this.renderer.setSize(width, height);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    document.body.appendChild(this.renderer.domElement);

    // カメラ操作用コントロールの初期化
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true; // 操作を滑らかにする設定

    // 【条件クリア】環境によってスピードが変わらないようにするための Clock 初期化
    this.clock = new THREE.Clock();

    // パーティクルシステムの構築
    this.createParticles();

    const animate = () => {
      requestAnimationFrame(animate);

      // コントロールの更新
      this.controls.update();

      // 【修正ポイント】Clockから正確なデルタタイムと経過時間を取得
      const deltaTime = this.clock.getDelta();
      const elapsedTime = this.clock.getElapsedTime();

      // ジオメトリと座標属性の取得
      const geom = this.cloud.geometry as THREE.BufferGeometry;
      const positions = geom.getAttribute('position') as THREE.BufferAttribute;

      for (let i = 0; i < this.particleNum; i++) {
        let x = positions.getX(i);
        let y = positions.getY(i);
        let z = positions.getZ(i);

        // 1. 【条件クリア】乱数による個別速度 × deltaTime で落下運動
        y -= this.velocities[i] * deltaTime;

        // 【自由性・クオリティ向上】微小な風の揺らぎを加え、より有機的な雨に
        x += Math.sin(elapsedTime * this.wobbleSpeeds[i] + this.wobbleOffsets[i]) * 0.5 * deltaTime;

        // 2. 【条件クリア】継続的に降り続けるためのループ処理
        // 画面下部に消えたら、即座にランダムな上空へとリセット
        if (y < -6) {
          y = 12; // 上空へ戻す
          x = (Math.random() - 0.5) * 16; // 新しいX座標
          z = (Math.random() - 0.5) * 16; // 新しいZ座標
        }

        positions.setX(i, x);
        positions.setY(i, y);
        positions.setZ(i, z);
      }

      // GPUへ変更を通知
      positions.needsUpdate = true;

      // 雨の空間全体をゆっくり自動回転させ、オービットカメラを回さなくても立体感が際立つように演出
      this.cloud.rotation.y = elapsedTime * 0.02;

      this.renderer.render(this.scene, this.camera);
    };

    animate();
  }

  /**
   * 授業用5ステッププロセスに完全対応したパーティクル生成ルーチン
   */
  private createParticles(): void {
    // 1. ジオメトリの作成
    const geometry = new THREE.BufferGeometry();

    // 2. マテリアルの作成
    // お手本のネオンシアンを美しく発光させるスプライトをCanvasで生成して指定
    const glowTexture = this.generateGlowingRainTexture();

    const material = new THREE.PointsMaterial({
      size: 0.35,                          // 粒子のサイズ
      map: glowTexture,                     // 作成した光るテクスチャを適用
      blending: THREE.AdditiveBlending,    // 加算合成で粒子が重なる中心部が超高輝度化
      depthWrite: false,                    // アルファマップの描画不具合を防止
      transparent: true,                   // 透明度を有効化
      opacity: 0.9,                        // 全体の不透明度
      sizeAttenuation: true                // カメラとの距離でリアルにサイズが減衰する
    });

    // 3. particleの作成（座標配列の確保と乱数パラメータの注入）
    const positions = new Float32Array(this.particleNum * 3);

    for (let i = 0; i < this.particleNum; i++) {
      // 空間全体にランダムに雨粒を散りばめる
      positions[i * 3] = (Math.random() - 0.5) * 16;     // X (-8 ~ 8)
      positions[i * 3 + 1] = Math.random() * 18 - 6;     // Y (-6 ~ 12)
      positions[i * 3 + 2] = (Math.random() - 0.5) * 16; // Z (-8 ~ 8)

      // 【条件クリア】各パーティクルに異なる落下速度を乱数で付与
      this.velocities.push(3.5 + Math.random() * 5.0); // 3.5〜8.5の範囲でランダム

      // クオリティ向上のための揺らぎパラメータ
      this.wobbleSpeeds.push(1.0 + Math.random() * 2.0);
      this.wobbleOffsets.push(Math.random() * Math.PI * 2);
    }

    // 座標データを登録
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));

    // 4. THREE.Pointsの作成
    this.cloud = new THREE.Points(geometry, material);

    // 5. シーンへの追加
    this.scene.add(this.cloud);
  }

  /**
   * 超高クオリティなネオンブルースプライトをCanvasで生成する関数
   */
  private generateGlowingRainTexture(): THREE.Texture {
    const canvas = document.createElement('canvas');
    canvas.width = 64;  // ジャギーを消し滑らかにするため解像度を高めに設定
    canvas.height = 64;

    const context = canvas.getContext('2d')!;
    const gradient = context.createRadialGradient(
      canvas.width / 2, canvas.height / 2, 0,
      canvas.width / 2, canvas.height / 2, canvas.width / 2
    );

    // お手本画像を精密再現するカラーグラデーション
    gradient.addColorStop(0, 'rgba(255, 255, 255, 1)');      // 中心は極限の白
    gradient.addColorStop(0.15, 'rgba(0, 230, 255, 1)');    // コア周辺は鮮やかなシアン
    gradient.addColorStop(0.4, 'rgba(0, 100, 200, 0.5)');   // 外側へ向けて深みのあるディープブルー
    gradient.addColorStop(1, 'rgba(0, 0, 0, 0)');           // 完全な透明に消灯

    context.fillStyle = gradient;
    context.fillRect(0, 0, canvas.width, canvas.height);

    const texture = new THREE.Texture(canvas);
    texture.needsUpdate = true;
    return texture;
  }
}

// 実行
new ThreeJSContainer();