import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import type { BallSkin, TrackConfig } from '../game/tracks';
import {
  BALL_RADIUS,
  CORRIDOR_HALF_WIDTH,
  Z_STEP_PER_BEAT,
  clampBallX,
  computeBallPoseAtTime,
  evaluateTileLanding,
  generateTrackTiles,
  getBeatDuration,
  getTileXAtTime,
  type BeatTile,
  type LandingJudgment,
} from '../game/beatEngine';
import { audioEngine } from '../game/audioSynth';

export type GameState = 'title' | 'playing' | 'paused' | 'gameover';

export interface HudSnapshot {
  score: number;
  combo: number;
  multiplier: number;
  gems: number;
  progress: number;
  judgment: LandingJudgment | null;
  judgmentSeq: number;
}

export interface RunResult {
  victory: boolean;
  score: number;
  maxCombo: number;
  gems: number;
  progress: number;
}

interface BeatCanvasProps {
  gameState: GameState;
  runKey: number;
  track: TrackConfig;
  skin: BallSkin;
  onHudUpdate: (hud: HudSnapshot) => void;
  onGameOver: (result: RunResult) => void;
  onFirstInput: () => void;
}

interface TileSlot {
  group: THREE.Group;
  body: THREE.Mesh;
  topPad: THREE.Mesh;
  topMat: THREE.MeshStandardMaterial;
  ring: THREE.Mesh;
  ringMat: THREE.MeshBasicMaterial;
  gem: THREE.Mesh;
  gemMat: THREE.MeshStandardMaterial;
  ringTimer: number;
  bounceOffset: number;
}

interface Particle {
  active: boolean;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  life: number;
  maxLife: number;
  scale: number;
  color: THREE.Color;
}

// Pre-allocated scratch objects (zero GC inside animation loop)
const _dummy = new THREE.Object3D();
const _colorA = new THREE.Color();
const _colorB = new THREE.Color();
const _colorMixed = new THREE.Color();
const _skyTarget = new THREE.Color();
const _fogTarget = new THREE.Color();

const TILE_POOL_SIZE = 26;
const EQ_BARS_PER_SIDE = 32;
const PARTICLE_POOL_SIZE = 96;

function detectSoftwareGl(): boolean {
  const probe = document.createElement('canvas');
  const gl = probe.getContext('webgl2');
  if (!gl) return true;
  const ext = gl.getExtension('WEBGL_debug_renderer_info');
  const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
  const gpu = String(gl.getParameter(param));
  gl.getExtension('WEBGL_lose_context')?.loseContext();
  return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
}

export function BeatCanvas({
  gameState,
  runKey,
  track,
  skin,
  onHudUpdate,
  onGameOver,
  onFirstInput,
}: BeatCanvasProps) {
  const mountRef = useRef<HTMLDivElement | null>(null);

  const propsRef = useRef({
    gameState,
    runKey,
    track,
    skin,
    onHudUpdate,
    onGameOver,
    onFirstInput,
  });
  propsRef.current = {
    gameState,
    runKey,
    track,
    skin,
    onHudUpdate,
    onGameOver,
    onFirstInput,
  };

  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    const isSoftwareGl = detectSoftwareGl();

    const renderer = new THREE.WebGLRenderer({
      antialias: !isSoftwareGl,
      powerPreference: 'high-performance',
    });
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.12;
    renderer.setPixelRatio(isSoftwareGl ? 1 : Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = !isSoftwareGl;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.domElement.style.display = 'block';
    renderer.domElement.style.width = '100%';
    renderer.domElement.style.height = '100%';
    renderer.domElement.className = 'touch-none-canvas';
    renderer.domElement.setAttribute('data-testid', 'beat-canvas');
    container.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const initialPalette = propsRef.current.track.palettes[0];
    scene.background = new THREE.Color(initialPalette.skyHex);
    scene.fog = new THREE.FogExp2(initialPalette.fogHex, 0.0155);

    const pmremGenerator = new THREE.PMREMGenerator(renderer);
    const envTarget = pmremGenerator.fromScene(new RoomEnvironment(), 0.04);
    scene.environment = envTarget.texture;
    pmremGenerator.dispose();

    const camera = new THREE.PerspectiveCamera(
      56,
      Math.max(1, container.clientWidth) / Math.max(1, container.clientHeight),
      0.1,
      190
    );
    camera.position.set(0, 5.2, 7.6);
    camera.lookAt(0, 1.0, -14);

    // Three-point / warm-cool contrast lighting (calibrated so ACESFilmic keeps neon colors saturated)
    const hemiLight = new THREE.HemisphereLight('#94a3b8', '#090d1a', 0.65);
    scene.add(hemiLight);

    const dirLight = new THREE.DirectionalLight('#fff1e6', 1.1);
    dirLight.position.set(7, 14, 9);
    if (!isSoftwareGl) {
      dirLight.castShadow = true;
      dirLight.shadow.mapSize.set(1024, 1024);
      dirLight.shadow.bias = -0.0005;
      dirLight.shadow.camera.near = 1;
      dirLight.shadow.camera.far = 45;
      dirLight.shadow.camera.left = -10;
      dirLight.shadow.camera.right = 10;
      dirLight.shadow.camera.top = 12;
      dirLight.shadow.camera.bottom = -12;
    }
    scene.add(dirLight);

    const rimLight = new THREE.DirectionalLight('#38bdf8', 0.6);
    rimLight.position.set(-8, 6, -18);
    scene.add(rimLight);

    // Highway Rails & Grid Floor
    const railGeo = new THREE.BoxGeometry(0.1, 0.12, 160);
    const railMat = new THREE.MeshStandardMaterial({
      color: '#38bdf8',
      emissive: '#0ea5e9',
      emissiveIntensity: 0.75,
      roughness: 0.25,
      metalness: 0.6,
    });
    const leftRail = new THREE.Mesh(railGeo, railMat);
    leftRail.position.set(-CORRIDOR_HALF_WIDTH - 0.15, -0.18, -60);
    const rightRail = new THREE.Mesh(railGeo, railMat);
    rightRail.position.set(CORRIDOR_HALF_WIDTH + 0.15, -0.18, -60);
    scene.add(leftRail, rightRail);

    // Subtle glowing horizon bridge plane below tiles
    const floorGeo = new THREE.PlaneGeometry(CORRIDOR_HALF_WIDTH * 2.1, 180);
    const floorMat = new THREE.MeshStandardMaterial({
      color: '#090d1c',
      roughness: 0.85,
      metalness: 0.15,
      transparent: true,
      opacity: 0.72,
    });
    const floorPlane = new THREE.Mesh(floorGeo, floorMat);
    floorPlane.rotation.x = -Math.PI / 2;
    floorPlane.position.set(0, -0.45, -60);
    scene.add(floorPlane);

    // Starfield dust for spatial speed sensation
    const starCount = 240;
    const starPositions = new Float32Array(starCount * 3);
    for (let i = 0; i < starCount; i++) {
      starPositions[i * 3] = (Math.random() - 0.5) * 44;
      starPositions[i * 3 + 1] = 1.5 + Math.random() * 20;
      starPositions[i * 3 + 2] = -Math.random() * 140 + 10;
    }
    const starGeo = new THREE.BufferGeometry();
    starGeo.setAttribute('position', new THREE.BufferAttribute(starPositions, 3));
    const starMat = new THREE.PointsMaterial({
      color: '#e2e8f0',
      size: 0.16,
      transparent: true,
      opacity: 0.75,
    });
    const starPoints = new THREE.Points(starGeo, starMat);
    scene.add(starPoints);

    // Composite 3-6 part Player Orb Group (core, gyro rings, satellites)
    const ballGroup = new THREE.Group();
    const coreGeo = new THREE.SphereGeometry(BALL_RADIUS * 0.72, 24, 18);
    const coreMat = new THREE.MeshStandardMaterial({
      color: propsRef.current.skin.coreHex,
      emissive: propsRef.current.skin.coreHex,
      emissiveIntensity: 0.72,
      roughness: 0.22,
      metalness: 0.15,
    });
    const coreMesh = new THREE.Mesh(coreGeo, coreMat);
    coreMesh.castShadow = !isSoftwareGl;

    const eqRingGeo = new THREE.TorusGeometry(BALL_RADIUS * 0.96, 0.055, 12, 32);
    const ringSkinMat = new THREE.MeshStandardMaterial({
      color: propsRef.current.skin.ringHex,
      emissive: propsRef.current.skin.coreHex,
      emissiveIntensity: 0.32,
      roughness: 0.2,
      metalness: 0.82,
    });
    const eqRing = new THREE.Mesh(eqRingGeo, ringSkinMat);
    eqRing.rotation.x = Math.PI / 2;

    const gyroGeo = new THREE.TorusGeometry(BALL_RADIUS * 1.06, 0.028, 10, 32);
    const gyroRing = new THREE.Mesh(gyroGeo, ringSkinMat);
    gyroRing.rotation.y = Math.PI / 3;

    const satGeo = new THREE.OctahedronGeometry(0.085, 0);
    const satMat = new THREE.MeshStandardMaterial({
      color: '#ffffff',
      emissive: propsRef.current.skin.trailHex,
      emissiveIntensity: 1.1,
      roughness: 0.25,
      metalness: 0.6,
    });
    const satA = new THREE.Mesh(satGeo, satMat);
    satA.position.set(BALL_RADIUS * 1.15, 0, 0);
    const satB = new THREE.Mesh(satGeo, satMat);
    satB.position.set(-BALL_RADIUS * 1.15, 0, 0);

    ballGroup.add(coreMesh, eqRing, gyroRing, satA, satB);
    ballGroup.position.set(0, BALL_RADIUS, 0);
    scene.add(ballGroup);

    // Contact shadow disc grounded under the ball
    const shadowGeo = new THREE.CircleGeometry(BALL_RADIUS * 1.35, 24);
    const shadowMat = new THREE.MeshBasicMaterial({
      color: '#020617',
      transparent: true,
      opacity: 0.45,
      depthWrite: false,
    });
    const contactShadow = new THREE.Mesh(shadowGeo, shadowMat);
    contactShadow.rotation.x = -Math.PI / 2;
    contactShadow.position.set(0, 0.02, 0);
    scene.add(contactShadow);

    // Pooled Beat Tiles
    const tileBodyGeo = new THREE.BoxGeometry(1, 0.28, 1);
    const tileTopGeo = new THREE.BoxGeometry(0.92, 0.08, 0.9);
    const tileRingGeo = new THREE.RingGeometry(0.45, 0.6, 28);
    const gemGeo = new THREE.OctahedronGeometry(0.24, 0);

    const tileBodyMat = new THREE.MeshStandardMaterial({
      color: '#111827',
      roughness: 0.58,
      metalness: 0.35,
    });

    const tilePool: TileSlot[] = [];
    for (let i = 0; i < TILE_POOL_SIZE; i++) {
      const group = new THREE.Group();
      const body = new THREE.Mesh(tileBodyGeo, tileBodyMat);
      body.position.y = -0.15;
      body.receiveShadow = !isSoftwareGl;

      const topMat = new THREE.MeshStandardMaterial({
        color: '#22d3ee',
        emissive: '#06b6d4',
        emissiveIntensity: 0.72,
        roughness: 0.22,
        metalness: 0.25,
      });
      const topPad = new THREE.Mesh(tileTopGeo, topMat);
      topPad.position.y = 0.01;

      const ringMat = new THREE.MeshBasicMaterial({
        color: '#ffffff',
        transparent: true,
        opacity: 0,
        side: THREE.DoubleSide,
        depthWrite: false,
      });
      const ring = new THREE.Mesh(tileRingGeo, ringMat);
      ring.rotation.x = -Math.PI / 2;
      ring.position.y = 0.06;

      const gemMat = new THREE.MeshStandardMaterial({
        color: '#fef08a',
        emissive: '#facc15',
        emissiveIntensity: 1.15,
        roughness: 0.15,
        metalness: 0.7,
      });
      const gem = new THREE.Mesh(gemGeo, gemMat);
      gem.position.y = 0.52;
      gem.visible = false;

      group.add(body, topPad, ring, gem);
      group.visible = false;
      scene.add(group);

      tilePool.push({
        group,
        body,
        topPad,
        topMat,
        ring,
        ringMat,
        gem,
        gemMat,
        ringTimer: 0,
        bounceOffset: 0,
      });
    }

    // Flanking Audio Equalizer Pillars (InstancedMesh)
    const totalEqBars = EQ_BARS_PER_SIDE * 2;
    const eqGeo = new THREE.BoxGeometry(0.32, 1, 0.32);
    const eqMat = new THREE.MeshStandardMaterial({
      color: '#0f172a',
      emissive: '#22d3ee',
      emissiveIntensity: 0.72,
      roughness: 0.35,
      metalness: 0.4,
    });
    const eqInstanced = new THREE.InstancedMesh(eqGeo, eqMat, totalEqBars);
    eqInstanced.frustumCulled = false;
    scene.add(eqInstanced);

    // Zero-GC Particle Ring Buffer (InstancedMesh)
    const particleGeo = new THREE.OctahedronGeometry(0.085, 0);
    const particleMat = new THREE.MeshBasicMaterial({ color: '#ffffff' });
    const particleInstanced = new THREE.InstancedMesh(
      particleGeo,
      particleMat,
      PARTICLE_POOL_SIZE
    );
    particleInstanced.frustumCulled = false;
    scene.add(particleInstanced);

    const particles: Particle[] = [];
    for (let i = 0; i < PARTICLE_POOL_SIZE; i++) {
      particles.push({
        active: false,
        x: 0,
        y: -100,
        z: 0,
        vx: 0,
        vy: 0,
        vz: 0,
        life: 0,
        maxLife: 0.5,
        scale: 1,
        color: new THREE.Color('#22d3ee'),
      });
      _dummy.position.set(0, -100, 0);
      _dummy.scale.setScalar(0.001);
      _dummy.updateMatrix();
      particleInstanced.setMatrixAt(i, _dummy.matrix);
      particleInstanced.setColorAt(i, particles[i].color);
    }
    particleInstanced.instanceMatrix.needsUpdate = true;

    let particleCursor = 0;
    function spawnBurst(
      x: number,
      y: number,
      z: number,
      count: number,
      hex: string,
      speedScale = 1
    ) {
      for (let i = 0; i < count; i++) {
        const p = particles[particleCursor];
        particleCursor = (particleCursor + 1) % PARTICLE_POOL_SIZE;
        p.active = true;
        p.x = x;
        p.y = y;
        p.z = z;
        const angle = (Math.PI * 2 * i) / count + Math.random() * 0.4;
        const spd = (1.6 + Math.random() * 2.6) * speedScale;
        p.vx = Math.cos(angle) * spd;
        p.vy = 1.8 + Math.random() * 2.8 * speedScale;
        p.vz = Math.sin(angle) * spd;
        p.life = 0;
        p.maxLife = 0.38 + Math.random() * 0.24;
        p.scale = 0.7 + Math.random() * 0.7;
        p.color.set(hex);
      }
    }

    // Simulation state
    let tiles: BeatTile[] = generateTrackTiles(propsRef.current.track);
    let simTime = 0;
    let ballX = 0;
    let lastCheckedBeat = 0;
    let score = 0;
    let combo = 0;
    let maxCombo = 0;
    let perfectStreak = 0;
    let gemsCollected = 0;
    let judgmentSeq = 0;
    let lastHudEmitTime = -1;
    let trauma = 0;
    let isFalling = false;
    let fallTimer = 0;
    let fallVy = 0;
    let fallY = 0;
    let pendingVictory = false;
    let activeRunKey = propsRef.current.runKey;
    let activeTrackId = propsRef.current.track.id;
    let prevState: GameState = propsRef.current.gameState;
    let inputNotified = false;
    let contextLost = false;

    const resetSimulation = () => {
      tiles = generateTrackTiles(propsRef.current.track);
      simTime = 0;
      ballX = 0;
      lastCheckedBeat = 0;
      score = 0;
      combo = 0;
      maxCombo = 0;
      perfectStreak = 0;
      gemsCollected = 0;
      judgmentSeq = 0;
      lastHudEmitTime = -1;
      trauma = 0;
      isFalling = false;
      fallTimer = 0;
      fallVy = 0;
      fallY = 0;
      pendingVictory = false;
      inputNotified = false;
      for (const slot of tilePool) {
        slot.ringTimer = 0;
        slot.bounceOffset = 0;
      }
      propsRef.current.onHudUpdate({
        score: 0,
        combo: 0,
        multiplier: 1,
        gems: 0,
        progress: 0,
        judgment: null,
        judgmentSeq: 0,
      });
    };

    // Input state (Pointer drag + Keyboard A/D/Arrows)
    let activePointerId: number | null = null;
    let lastPointerX = 0;
    const keysHeld = new Set<string>();

    const notifySteering = () => {
      if (!inputNotified && propsRef.current.gameState === 'playing') {
        inputNotified = true;
        propsRef.current.onFirstInput();
      }
    };

    const onPointerDown = (e: PointerEvent) => {
      if (propsRef.current.gameState !== 'playing') return;
      audioEngine.unlock();
      activePointerId = e.pointerId;
      lastPointerX = e.clientX;
      try {
        renderer.domElement.setPointerCapture(e.pointerId);
      } catch {
        // ignore synthetic test events
      }
      notifySteering();
    };

    const onPointerMove = (e: PointerEvent) => {
      if (propsRef.current.gameState !== 'playing') return;
      if (activePointerId !== e.pointerId && e.buttons === 0) return;
      if (activePointerId === null) {
        lastPointerX = e.clientX;
        activePointerId = e.pointerId;
      }
      const dx = e.clientX - lastPointerX;
      lastPointerX = e.clientX;
      const rect = renderer.domElement.getBoundingClientRect();
      const width = Math.max(240, rect.width);
      // Responsive 1-thumb drag calibration: half screen swipe crosses corridor
      const worldSensitivity = 8.4 / width;
      ballX = clampBallX(ballX + dx * worldSensitivity);
      if (Math.abs(dx) > 1) notifySteering();
    };

    const onPointerUp = (e: PointerEvent) => {
      if (activePointerId === e.pointerId) {
        activePointerId = null;
      }
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (
        e.key === 'ArrowLeft' ||
        e.key === 'ArrowRight' ||
        e.key === 'a' ||
        e.key === 'A' ||
        e.key === 'd' ||
        e.key === 'D'
      ) {
        keysHeld.add(e.key.toLowerCase());
        if (propsRef.current.gameState === 'playing') {
          audioEngine.unlock();
          notifySteering();
        }
      }
    };

    const onKeyUp = (e: KeyboardEvent) => {
      keysHeld.delete(e.key.toLowerCase());
    };

    const clearInputs = () => {
      keysHeld.clear();
      activePointerId = null;
    };

    const onVisibilityChange = () => {
      if (document.hidden) clearInputs();
    };

    const onContextLost = (e: Event) => {
      e.preventDefault();
      contextLost = true;
    };
    const onContextRestored = () => {
      contextLost = false;
    };

    renderer.domElement.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    window.addEventListener('pointercancel', onPointerUp);
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', clearInputs);
    document.addEventListener('visibilitychange', onVisibilityChange);
    renderer.domElement.addEventListener('webglcontextlost', onContextLost);
    renderer.domElement.addEventListener('webglcontextrestored', onContextRestored);

    const handleResize = () => {
      const w = Math.max(1, container.clientWidth);
      const h = Math.max(1, container.clientHeight);
      camera.aspect = w / h;
      // Slightly wider FOV on narrow portrait phones so upcoming corridor stays visible
      camera.fov = w / h < 0.75 ? 64 : 55;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h, false);
      if (!contextLost) {
        renderer.render(scene, camera);
      }
    };
    handleResize();
    const resizeObs = new ResizeObserver(handleResize);
    resizeObs.observe(container);

    if (!isSoftwareGl) {
      renderer.compile(scene, camera);
    }

    let frameId = 0;
    let disposed = false;
    let lastTimestamp = performance.now();

    function afterDraw(cb: () => void) {
      const gl = renderer.getContext() as WebGL2RenderingContext;
      const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
      gl.flush();
      const poll = () => {
        if (disposed) return;
        const state = sync && gl.getSyncParameter(sync, gl.SYNC_STATUS);
        if (state === gl.UNSIGNALED) {
          frameId = window.setTimeout(poll, 5);
        } else {
          if (sync) gl.deleteSync(sync);
          frameId = window.setTimeout(cb, 80);
        }
      };
      frameId = window.setTimeout(poll, 5);
    }

    function tick(now = performance.now()) {
      if (disposed) return;

      const rawDt = Math.max(0.001, (now - lastTimestamp) / 1000);
      lastTimestamp = now;
      const dt = Math.min(rawDt, 0.2);

      const {
        gameState: state,
        runKey: curRunKey,
        track: curTrack,
        skin: curSkin,
      } = propsRef.current;

      // Handle run restarts or track switches
      if (curRunKey !== activeRunKey || curTrack.id !== activeTrackId) {
        activeRunKey = curRunKey;
        activeTrackId = curTrack.id;
        resetSimulation();
      }
      if (state === 'playing' && prevState === 'title') {
        resetSimulation();
      }
      prevState = state;

      // Update ball skin materials smoothly
      coreMat.color.set(curSkin.coreHex);
      coreMat.emissive.set(curSkin.coreHex);
      ringSkinMat.color.set(curSkin.ringHex);
      ringSkinMat.emissive.set(curSkin.coreHex);
      satMat.emissive.set(curSkin.trailHex);

      // Determine palette blending across track progression
      const totalDuration = Math.max(1, curTrack.totalBeats * getBeatDuration(curTrack.bpm));
      const progressRatio = Math.min(1, simTime / totalDuration);
      const palA = curTrack.palettes[0];
      const palB = curTrack.palettes[curTrack.palettes.length - 1];
      const paletteMix =
        state === 'title'
          ? (Math.sin(now * 0.0004) + 1) * 0.5
          : Math.min(1, Math.max(0, (progressRatio - 0.25) * 1.4));

      _colorA.set(palA.primaryHex);
      _colorB.set(palB.primaryHex);
      _colorMixed.copy(_colorA).lerp(_colorB, paletteMix);

      _skyTarget.set(palA.skyHex).lerp(_fogTarget.set(palB.skyHex), paletteMix);
      (scene.background as THREE.Color).lerp(_skyTarget, 1 - Math.exp(-3 * dt));
      if (scene.fog instanceof THREE.FogExp2) {
        _fogTarget.set(palA.fogHex).lerp(_colorA.set(palB.fogHex), paletteMix);
        scene.fog.color.lerp(_fogTarget, 1 - Math.exp(-3 * dt));
      }
      railMat.color.copy(_colorMixed);
      railMat.emissive.copy(_colorMixed);
      eqMat.emissive.copy(_colorMixed);

      // Advance simulation clock & physics
      if (state === 'title') {
        simTime += dt;
        const loopBeat = (simTime / getBeatDuration(curTrack.bpm)) % (tiles.length - 4);
        const previewTime = loopBeat * getBeatDuration(curTrack.bpm);
        const pose = computeBallPoseAtTime(previewTime, curTrack.bpm);
        const targetTile = tiles[Math.min(tiles.length - 1, pose.beatIndex + 1)];
        const prevTile = tiles[Math.min(tiles.length - 1, pose.beatIndex)];
        const targetX = THREE.MathUtils.lerp(
          getTileXAtTime(prevTile, previewTime),
          getTileXAtTime(targetTile, previewTime),
          pose.beatPhase
        );
        ballX = THREE.MathUtils.damp(ballX, targetX, 8, dt);

        ballGroup.position.set(ballX, BALL_RADIUS + pose.y, pose.z);
        ballGroup.scale.set(pose.scaleX, pose.scaleY, pose.scaleZ);
        contactShadow.position.set(ballX, 0.02, pose.z);
        const shadowScale = Math.max(0.45, 1 - pose.y * 0.22);
        contactShadow.scale.setScalar(shadowScale);
        shadowMat.opacity = 0.42 * shadowScale;

        // Cinematic title showcase camera: frame orb in the open middle band above bottom card
        const camX = Math.sin(now * 0.0007) * 1.4;
        camera.position.x = THREE.MathUtils.damp(camera.position.x, camX, 3, dt);
        camera.position.y = THREE.MathUtils.damp(camera.position.y, 4.1, 3, dt);
        camera.position.z = pose.z + 6.9;
        camera.lookAt(ballX * 0.35, -0.55, pose.z - 8);

        updateSceneVisuals(previewTime, pose.z, 0.28 + Math.sin(pose.beatPhase * Math.PI) * 0.35);
      } else if (state === 'playing') {
        // Keyboard lateral movement
        let moveAxis = 0;
        if (keysHeld.has('arrowleft') || keysHeld.has('a')) moveAxis -= 1;
        if (keysHeld.has('arrowright') || keysHeld.has('d')) moveAxis += 1;
        if (moveAxis !== 0) {
          ballX = clampBallX(ballX + moveAxis * 7.4 * dt);
        }

        if (!isFalling && !pendingVictory) {
          simTime += dt;
          const audioTime = audioEngine.getSongTime();
          if (audioTime > 0.05 && Math.abs(audioTime - simTime) < 0.35) {
            // Gently lock visual phase to hardware Web Audio clock
            simTime = THREE.MathUtils.lerp(simTime, audioTime, 0.2);
          }

          const pose = computeBallPoseAtTime(simTime, curTrack.bpm);

          // Check beat landing whenever ball crosses a new integer beat
          while (lastCheckedBeat < pose.beatIndex && lastCheckedBeat + 1 < tiles.length) {
            lastCheckedBeat++;
            const landedTile = tiles[lastCheckedBeat];
            const result = evaluateTileLanding(
              ballX,
              landedTile,
              landedTile.beatTime,
              combo,
              perfectStreak
            );

            if (result.judgment === 'miss') {
              landedTile.hitState = 'missed';
              isFalling = true;
              fallTimer = 0;
              fallY = BALL_RADIUS;
              fallVy = -1.2;
              trauma = 0.75;
              audioEngine.playMiss();
              audioEngine.pause();
              spawnBurst(ballX, 0.15, landedTile.z, 14, '#fb7185', 1.1);
              break;
            } else {
              landedTile.hitState = result.judgment;
              score += result.pointsAwarded;
              combo = result.nextCombo;
              maxCombo = Math.max(maxCombo, combo);
              perfectStreak = result.nextPerfectStreak;
              if (result.gemCollected) {
                landedTile.gemCollected = true;
                gemsCollected += 1;
                audioEngine.playGem();
                spawnBurst(ballX, 0.55, landedTile.z, 12, '#facc15', 1.2);
              }
              judgmentSeq++;

              // Trigger tile ring & bounce depression
              const slotIdx = landedTile.index % TILE_POOL_SIZE;
              const slot = tilePool[slotIdx];
              slot.ringTimer = 0.001;
              slot.bounceOffset = -0.22;

              if (result.judgment === 'perfect') {
                audioEngine.playPerfect(result.multiplier);
                spawnBurst(ballX, 0.12, landedTile.z, 10, _colorMixed.getStyle(), 1.0);
                if (result.multiplier >= 3) trauma = Math.max(trauma, 0.22);
              } else {
                audioEngine.playGood();
                spawnBurst(ballX, 0.12, landedTile.z, 5, '#e2e8f0', 0.75);
              }

              const prog = lastCheckedBeat / Math.max(1, tiles.length - 1);
              propsRef.current.onHudUpdate({
                score,
                combo,
                multiplier: result.multiplier,
                gems: gemsCollected,
                progress: prog,
                judgment: result.judgment,
                judgmentSeq,
              });

              if (lastCheckedBeat >= tiles.length - 1) {
                pendingVictory = true;
                fallTimer = 0;
                audioEngine.playVictory();
                spawnBurst(ballX, 0.5, landedTile.z, 26, '#facc15', 1.45);
                break;
              }
            }
          }

          if (!isFalling && !pendingVictory) {
            ballGroup.position.set(ballX, BALL_RADIUS + pose.y, pose.z);
            ballGroup.scale.set(pose.scaleX, pose.scaleY, pose.scaleZ);
            contactShadow.position.set(ballX, 0.02, pose.z);
            const shadowScale = Math.max(0.45, 1 - pose.y * 0.22);
            contactShadow.scale.setScalar(shadowScale);
            shadowMat.opacity = 0.45 * shadowScale;

            // Smooth chase cam
            camera.position.x = THREE.MathUtils.damp(camera.position.x, ballX * 0.38, 7, dt);
            camera.position.y = THREE.MathUtils.damp(camera.position.y, 4.95, 6, dt);
            camera.position.z = pose.z + 7.2;
            camera.lookAt(ballX * 0.28, 0.75, pose.z - 12);

            // Emit continuous subtle trail particles
            if (Math.random() < 0.38) {
              spawnBurst(ballX, BALL_RADIUS + pose.y, pose.z + 0.2, 1, curSkin.trailHex, 0.35);
            }

            if (now - lastHudEmitTime > 120) {
              lastHudEmitTime = now;
              propsRef.current.onHudUpdate({
                score,
                combo,
                multiplier: Math.min(4, 1 + Math.floor(perfectStreak / 3)),
                gems: gemsCollected,
                progress: Math.min(1, simTime / totalDuration),
                judgment: null,
                judgmentSeq,
              });
            }

            updateSceneVisuals(simTime, pose.z, audioEngine.getBeatEnergy());
          }
        } else if (isFalling) {
          // Dramatic defeat fall beat (0.48s) before Game Over modal
          fallTimer += dt;
          fallVy -= 22 * dt;
          fallY += fallVy * dt;
          const pose = computeBallPoseAtTime(simTime, curTrack.bpm);
          ballGroup.position.set(ballX, fallY, pose.z - fallTimer * 3.5);
          ballGroup.scale.set(0.95, 1.08, 0.95);
          shadowMat.opacity = 0;
          updateSceneVisuals(simTime, pose.z, 0.1);

          if (fallTimer >= 0.48) {
            isFalling = false;
            audioEngine.stop();
            propsRef.current.onGameOver({
              victory: false,
              score,
              maxCombo,
              gems: gemsCollected,
              progress: Math.min(0.99, lastCheckedBeat / Math.max(1, tiles.length - 1)),
            });
          }
        } else if (pendingVictory) {
          fallTimer += dt;
          const endTile = tiles[tiles.length - 1];
          ballGroup.position.set(ballX, BALL_RADIUS + Math.sin(fallTimer * 8) * 0.25, endTile.z);
          updateSceneVisuals(simTime, endTile.z, 0.6);
          if (fallTimer >= 0.55) {
            pendingVictory = false;
            audioEngine.stop();
            propsRef.current.onGameOver({
              victory: true,
              score,
              maxCombo,
              gems: gemsCollected,
              progress: 1,
            });
          }
        }
      } else {
        // Paused or GameOver: keep world frozen cleanly
        const pose = computeBallPoseAtTime(simTime, curTrack.bpm);
        updateSceneVisuals(simTime, pose.z, 0.12);
      }

      // Spin hero orb rings smoothly
      eqRing.rotation.z += dt * 1.8;
      gyroRing.rotation.x += dt * 2.4;
      gyroRing.rotation.z -= dt * 1.1;
      satA.position.set(Math.cos(now * 0.005) * 0.52, Math.sin(now * 0.007) * 0.12, Math.sin(now * 0.005) * 0.52);
      satB.position.set(-satA.position.x, -satA.position.y, -satA.position.z);

      // Apply decaying trauma camera shake
      if (trauma > 0.001) {
        const shake = trauma * trauma;
        camera.position.x += (Math.random() - 0.5) * 0.42 * shake;
        camera.position.y += (Math.random() - 0.5) * 0.34 * shake;
        trauma = Math.max(0, trauma - dt * 2.1);
      }

      // Update pooled particles in-place
      let particlesChanged = false;
      for (let i = 0; i < PARTICLE_POOL_SIZE; i++) {
        const p = particles[i];
        if (!p.active) continue;
        particlesChanged = true;
        p.life += dt;
        if (p.life >= p.maxLife) {
          p.active = false;
          _dummy.position.set(0, -100, 0);
          _dummy.scale.setScalar(0.001);
          _dummy.updateMatrix();
          particleInstanced.setMatrixAt(i, _dummy.matrix);
          continue;
        }
        p.vy -= 9.5 * dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.z += p.vz * dt;
        const s = p.scale * (1 - p.life / p.maxLife);
        _dummy.position.set(p.x, p.y, p.z);
        _dummy.rotation.set(p.life * 6, p.life * 4, 0);
        _dummy.scale.setScalar(Math.max(0.01, s));
        _dummy.updateMatrix();
        particleInstanced.setMatrixAt(i, _dummy.matrix);
        particleInstanced.setColorAt(i, p.color);
      }
      if (particlesChanged) {
        particleInstanced.instanceMatrix.needsUpdate = true;
        if (particleInstanced.instanceColor) particleInstanced.instanceColor.needsUpdate = true;
      }

      if (!contextLost) {
        renderer.render(scene, camera);
      }

      if (isSoftwareGl) {
        afterDraw(() => tick());
      } else {
        frameId = requestAnimationFrame(tick);
      }

      function updateSceneVisuals(timeRef: number, currentZ: number, energy: number) {
        // Keep rails & floor centered around currentZ
        leftRail.position.z = currentZ - 55;
        rightRail.position.z = currentZ - 55;
        floorPlane.position.z = currentZ - 55;
        dirLight.position.z = currentZ + 9;
        dirLight.target.position.set(0, 0, currentZ - 8);
        dirLight.target.updateMatrixWorld();

        // Recycle starfield seamlessly behind camera
        const posAttr = starGeo.getAttribute('position') as THREE.BufferAttribute;
        for (let i = 0; i < starCount; i++) {
          let sz = posAttr.getZ(i);
          if (sz > currentZ + 12) {
            sz -= 145;
            posAttr.setZ(i, sz);
          }
        }
        posAttr.needsUpdate = true;

        // Position visible pooled tiles around current beat
        const beatDur = getBeatDuration(curTrack.bpm);
        const startBeat = Math.max(0, Math.floor(timeRef / beatDur) - 2);
        for (let i = 0; i < TILE_POOL_SIZE; i++) {
          const tileIndex = startBeat + i;
          const slot = tilePool[tileIndex % TILE_POOL_SIZE];
          if (tileIndex >= tiles.length) {
            slot.group.visible = false;
            continue;
          }
          const tile = tiles[tileIndex];
          slot.group.visible = true;
          const tx = getTileXAtTime(tile, timeRef);

          // Spring bounce offset back to 0
          slot.bounceOffset = THREE.MathUtils.damp(slot.bounceOffset, 0, 14, dt);
          slot.group.position.set(tx, slot.bounceOffset, tile.z);

          slot.body.scale.set(tile.width, 1, tile.depth);
          slot.topPad.scale.set(tile.width, 1, tile.depth);

          // Highlight upcoming target tile vs moving tile vs hit tile
          if (tile.hitState === 'perfect') {
            slot.topMat.color.copy(_colorMixed);
            slot.topMat.emissive.copy(_colorMixed);
            slot.topMat.emissiveIntensity = 0.85;
          } else if (tile.isMoving) {
            slot.topMat.color.set('#1e1b4b');
            slot.topMat.emissive.set(palB.secondaryHex);
            slot.topMat.emissiveIntensity = 0.72 + energy * 0.25;
          } else {
            slot.topMat.color.set('#0f172a');
            slot.topMat.emissive.copy(_colorMixed);
            slot.topMat.emissiveIntensity = 0.52 + energy * 0.28;
          }

          // Expanding impact ring animation
          if (slot.ringTimer > 0) {
            slot.ringTimer += dt * 2.8;
            if (slot.ringTimer >= 1) {
              slot.ringTimer = 0;
              slot.ringMat.opacity = 0;
            } else {
              slot.ringMat.opacity = (1 - slot.ringTimer) * 0.9;
              const ringScale = 1 + slot.ringTimer * 1.9;
              slot.ring.scale.set(ringScale, ringScale, 1);
            }
          } else {
            slot.ringMat.opacity = 0;
          }

          // Bonus rotating gem above gem tiles
          if (tile.hasGem && !tile.gemCollected) {
            slot.gem.visible = true;
            slot.gem.position.set(tile.gemOffsetX, 0.56 + Math.sin(now * 0.006 + tile.index) * 0.1, 0);
            slot.gem.rotation.y = now * 0.003 + tile.index;
          } else {
            slot.gem.visible = false;
          }
        }

        // Equalizer bars along left & right highway edges
        const baseBarZ = Math.floor(currentZ / 3) * 3;
        for (let i = 0; i < EQ_BARS_PER_SIDE; i++) {
          const zPos = baseBarZ + 6 - i * 3;
          const wave = Math.sin(now * 0.008 + i * 0.55) * 0.5 + 0.5;
          const h = 0.5 + (energy * 2.8 + wave * 0.9) * (1 - i / (EQ_BARS_PER_SIDE * 1.4));

          // Left bar
          _dummy.position.set(-CORRIDOR_HALF_WIDTH - 1.05, h * 0.5 - 0.35, zPos);
          _dummy.rotation.set(0, 0, 0);
          _dummy.scale.set(1, Math.max(0.35, h), 1);
          _dummy.updateMatrix();
          eqInstanced.setMatrixAt(i * 2, _dummy.matrix);

          // Right bar
          _dummy.position.set(CORRIDOR_HALF_WIDTH + 1.05, h * 0.5 - 0.35, zPos);
          _dummy.updateMatrix();
          eqInstanced.setMatrixAt(i * 2 + 1, _dummy.matrix);
        }
        eqInstanced.instanceMatrix.needsUpdate = true;
      }
    }

    frameId = requestAnimationFrame(tick);

    return () => {
      disposed = true;
      cancelAnimationFrame(frameId);
      clearTimeout(frameId);
      resizeObs.disconnect();
      renderer.domElement.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('pointercancel', onPointerUp);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', clearInputs);
      document.removeEventListener('visibilitychange', onVisibilityChange);
      renderer.domElement.removeEventListener('webglcontextlost', onContextLost);
      renderer.domElement.removeEventListener('webglcontextrestored', onContextRestored);

      scene.traverse((obj) => {
        if (obj instanceof THREE.Mesh || obj instanceof THREE.Points) {
          obj.geometry.dispose();
          if (Array.isArray(obj.material)) {
            obj.material.forEach((m) => m.dispose());
          } else {
            obj.material.dispose();
          }
        }
      });
      envTarget.dispose();
      renderer.dispose();
      if (renderer.domElement.parentNode === container) {
        container.removeChild(renderer.domElement);
      }
    };
  }, []);

  return <div ref={mountRef} className="fixed inset-0 w-full h-full overflow-hidden" />;
}
