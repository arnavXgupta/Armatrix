import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import type { Candidate, RawMesh } from '../geometry/types'

// Colours come from the CSS tokens so brand.md stays the single source.
const token = (name: string) => new THREE.Color(getComputedStyle(document.documentElement).getPropertyValue(name).trim())

const FOV = 40
const ISO = new THREE.Vector3(1, 0.75, 1.25).normalize() // default view: front-right, slightly above

/**
 * Imperative three.js view. Scene graph:
 *   scene ─ part (rotated so STL +Z is up) ─ offset (−bbox centre) ─ mesh, candidate lines   [raw coordinates]
 *         ─ grid, cameras (key light rides on the active camera)
 * Renders on demand only: no loop while nothing changes.
 */
export class Scene {
  private renderer: THREE.WebGLRenderer
  private scene = new THREE.Scene()
  private persp = new THREE.PerspectiveCamera(FOV, 1, 0.1, 1000)
  private ortho = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 1000)
  private camera: THREE.PerspectiveCamera | THREE.OrthographicCamera = this.persp
  private controls: OrbitControls
  private key = new THREE.DirectionalLight(0xffffff, 2.2)
  private part = new THREE.Group()
  private offset = new THREE.Group()
  private mesh: THREE.Mesh | null = null
  private lines: THREE.LineSegments | null = null
  private grid: THREE.GridHelper | null = null
  private solid: THREE.MeshStandardMaterial
  private wire: THREE.MeshBasicMaterial
  private lineMat = new THREE.LineBasicMaterial({ vertexColors: true })
  // Dark lines on the sand mesh (brand.md's sand-4 is 1.8:1 against sand-2, near invisible; see decisions.md)
  private colors = { crease: token('--green'), boundary: token('--forest') }
  private radius = 1
  private showLines = true
  private wireframe = false
  private frame = 0
  private observer: ResizeObserver
  private host: HTMLElement

  constructor(host: HTMLElement, onContextLost: () => void) {
    this.host = host
    this.renderer = new THREE.WebGLRenderer({ antialias: true })
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2))
    const canvas = this.renderer.domElement
    canvas.addEventListener('webglcontextlost', (e) => {
      e.preventDefault()
      onContextLost()
    })
    host.appendChild(canvas)

    this.scene.background = token('--bg')
    this.scene.add(new THREE.HemisphereLight(token('--sand'), token('--forest-4'), 1.4))
    this.scene.add(this.persp, this.ortho, this.part)
    this.persp.add(this.key)
    this.part.rotation.x = -Math.PI / 2 // STL is Z-up, three.js is Y-up
    this.part.add(this.offset)

    this.solid = new THREE.MeshStandardMaterial({
      color: token('--sand-2'),
      roughness: 0.85,
      metalness: 0.1,
      flatShading: true, // normals from screen derivatives: no normal buffer, and inverted faces still light
      side: THREE.DoubleSide, // open shells and flipped triangles stay visible
      polygonOffset: true, // push faces back so edge lines on them never z-fight
      polygonOffsetFactor: 1,
      polygonOffsetUnits: 1,
    })
    this.wire = new THREE.MeshBasicMaterial({ color: token('--sand-4'), wireframe: true })

    this.controls = new OrbitControls(this.persp, canvas)
    this.controls.addEventListener('change', () => this.requestRender())

    this.observer = new ResizeObserver(() => this.resize())
    this.observer.observe(host)
    this.resize()
  }

  setMesh(raw: RawMesh | null) {
    if (this.mesh) {
      this.offset.remove(this.mesh)
      this.mesh.geometry.dispose()
      this.mesh = null
    }
    this.setCandidates([])
    if (this.grid) {
      this.scene.remove(this.grid)
      this.grid.dispose()
      this.grid = null
    }
    if (!raw) return this.requestRender()

    const { min, max } = raw.bbox
    const size = max.map((v, i) => v - min[i])
    const centre = new THREE.Vector3((min[0] + max[0]) / 2, (min[1] + max[1]) / 2, (min[2] + max[2]) / 2)
    this.radius = Math.max(Math.hypot(size[0], size[1], size[2]) / 2, 1e-6)

    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', new THREE.BufferAttribute(raw.positions, 3))
    // From the parser's bbox: computeBoundingSphere() would walk every vertex again (~40 ms at 1M tris).
    geometry.boundingBox = new THREE.Box3(new THREE.Vector3(...min), new THREE.Vector3(...max))
    geometry.boundingSphere = new THREE.Sphere(centre, this.radius)
    this.mesh = new THREE.Mesh(geometry, this.wireframe ? this.wire : this.solid)
    this.offset.add(this.mesh)
    this.offset.position.copy(centre).negate()

    // Grid on the floor under the part: raw XY plane at raw min Z (world y = −sizeZ/2).
    const span = niceCeil(Math.max(size[0], size[1]) * 1.6)
    this.grid = new THREE.GridHelper(span, 16, token('--green-2'), token('--green'))
    this.grid.position.y = -size[2] / 2 - this.radius * 0.002
    this.scene.add(this.grid)

    this.fit(true)
  }

  setCandidates(candidates: Candidate[]) {
    if (this.lines) {
      this.offset.remove(this.lines)
      this.lines.geometry.dispose()
      this.lines = null
    }
    let segments = 0
    for (const c of candidates) segments += c.points.length - 1 + (c.closed ? 1 : 0)
    if (segments > 0) {
      const pos = new Float32Array(segments * 6)
      const col = new Float32Array(segments * 6)
      let o = 0
      for (const c of candidates) {
        const { r, g, b } = c.kind === 'boundary' ? this.colors.boundary : this.colors.crease
        const n = c.points.length
        for (let i = 0; i < n - 1 + (c.closed ? 1 : 0); i++) {
          for (const p of [c.points[i], c.points[(i + 1) % n]]) {
            pos.set(p, o)
            col.set([r, g, b], o)
            o += 3
          }
        }
      }
      const geometry = new THREE.BufferGeometry()
      geometry.setAttribute('position', new THREE.BufferAttribute(pos, 3))
      geometry.setAttribute('color', new THREE.BufferAttribute(col, 3))
      this.lines = new THREE.LineSegments(geometry, this.lineMat)
      this.lines.visible = this.showLines
      this.offset.add(this.lines)
    }
    this.requestRender()
  }

  setCandidatesVisible(visible: boolean) {
    this.showLines = visible
    if (this.lines) this.lines.visible = visible
    this.requestRender()
  }

  setWireframe(on: boolean) {
    this.wireframe = on
    if (this.mesh) this.mesh.material = on ? this.wire : this.solid
    this.requestRender()
  }

  setOrtho(on: boolean) {
    const from = this.camera
    const to = on ? this.ortho : this.persp
    if (from === to) return
    const target = this.controls.target
    const dist = from.position.distanceTo(target)
    const halfTan = Math.tan(THREE.MathUtils.degToRad(FOV / 2))
    to.position.copy(from.position)
    to.quaternion.copy(from.quaternion)
    if (on) {
      // same apparent size: ortho half-height = perspective half-height at the target
      this.ortho.zoom = this.orthoHalfHeight() / (dist * halfTan)
    } else {
      const visibleHalf = this.orthoHalfHeight() / this.ortho.zoom
      const dir = from.position.clone().sub(target).normalize()
      to.position.copy(target).addScaledVector(dir, visibleHalf / halfTan)
    }
    to.add(this.key)
    this.camera = to
    this.controls.object = to
    this.updateProjection()
    this.controls.update()
    this.requestRender()
  }

  /** Frame the whole part. `resetView` also returns to the default iso direction. */
  fit(resetView = false) {
    const r = this.radius
    const target = this.controls.target
    const dir = resetView ? ISO.clone() : this.camera.position.clone().sub(target).normalize()
    if (dir.lengthSq() < 0.5) dir.copy(ISO)
    const aspect = this.aspect()
    const halfV = THREE.MathUtils.degToRad(FOV / 2)
    const halfH = Math.atan(Math.tan(halfV) * aspect)
    const dist = (r / Math.sin(Math.min(halfV, halfH))) * 1.05

    target.set(0, 0, 0)
    for (const cam of [this.persp, this.ortho]) {
      cam.position.copy(dir).multiplyScalar(dist)
      cam.lookAt(target)
      cam.near = r / 100
      cam.far = r * 100
    }
    this.ortho.zoom = 1
    this.key.position.set(-r, r * 1.5, 0) // upper left of the view
    this.controls.minDistance = r * 0.05
    this.controls.maxDistance = r * 20
    this.controls.minZoom = 0.05
    this.controls.maxZoom = 50
    this.updateProjection()
    this.controls.update()
    this.requestRender()
  }

  dispose() {
    cancelAnimationFrame(this.frame)
    this.observer.disconnect()
    this.controls.dispose()
    this.setMesh(null)
    this.solid.dispose()
    this.wire.dispose()
    this.lineMat.dispose()
    this.renderer.dispose()
    this.renderer.domElement.remove()
  }

  private aspect() {
    return Math.max(this.host.clientWidth, 1) / Math.max(this.host.clientHeight, 1)
  }

  /** Ortho frustum half-height that fits the part at zoom 1, honouring portrait aspect. */
  private orthoHalfHeight() {
    return this.radius * 1.05 * Math.max(1, 1 / this.aspect())
  }

  private updateProjection() {
    const aspect = this.aspect()
    this.persp.aspect = aspect
    this.persp.updateProjectionMatrix()
    const h = this.orthoHalfHeight()
    this.ortho.left = -h * aspect
    this.ortho.right = h * aspect
    this.ortho.top = h
    this.ortho.bottom = -h
    this.ortho.updateProjectionMatrix()
  }

  private resize() {
    const w = Math.max(this.host.clientWidth, 1)
    const h = Math.max(this.host.clientHeight, 1)
    this.renderer.setSize(w, h, false)
    this.updateProjection()
    this.render()
  }

  private requestRender() {
    if (this.frame) return
    this.frame = requestAnimationFrame(() => this.render())
  }

  private render() {
    cancelAnimationFrame(this.frame)
    this.frame = 0
    this.renderer.render(this.scene, this.camera)
  }
}

/** Round up to 1, 2 or 5 × 10^n so grid cells land on readable sizes. */
function niceCeil(v: number) {
  const p = 10 ** Math.floor(Math.log10(v || 1))
  return ([1, 2, 5, 10].find((m) => m * p >= v) ?? 10) * p
}
