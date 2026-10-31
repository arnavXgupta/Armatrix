import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { LineMaterial } from 'three/addons/lines/LineMaterial.js'
import { LineSegments2 } from 'three/addons/lines/LineSegments2.js'
import { LineSegmentsGeometry } from 'three/addons/lines/LineSegmentsGeometry.js'
import { CSS2DObject, CSS2DRenderer } from 'three/addons/renderers/CSS2DRenderer.js'
import type { Candidate, RawMesh, Vec3 } from '../geometry/types'
import type { Seam } from '../store/seams'

// Colours come from the CSS tokens so brand.md stays the single source.
const token = (name: string) => new THREE.Color(getComputedStyle(document.documentElement).getPropertyValue(name).trim())
const reducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

const FOV = 40
const ISO = new THREE.Vector3(1, 0.75, 1.25).normalize() // default view: front-right, slightly above
const PICK_RADIUS_PX = 6
const Y = new THREE.Vector3(0, 1, 0)

type Polyline = { points: Vec3[]; closed: boolean }

/**
 * Imperative three.js view. Scene graph:
 *   scene ─ part (rotated so STL +Z is up) ─ offset (−bbox centre) ─ mesh, lines, seams, markers, chips  [raw coordinates]
 *         ─ grid, cameras (key light rides on the active camera)
 *   pickScene mirrors part/offset with a depth-only copy of the mesh and id-coloured candidate lines.
 * Renders on demand only: no loop while nothing changes.
 */
export class Scene {
  private renderer: THREE.WebGLRenderer
  private labels = new CSS2DRenderer()
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
  private markers = new THREE.Group()
  private chips = new THREE.Group()
  private solid: THREE.MeshStandardMaterial
  private wire: THREE.MeshBasicMaterial
  private lineMat = new THREE.LineBasicMaterial({ vertexColors: true })
  // Dark lines on the sand mesh (brand.md's sand-4 is 1.8:1 against sand-2, near invisible; see decisions.md)
  private colors = {
    crease: token('--green'),
    boundary: token('--forest'),
    seam: token('--green-4'),
    selected: token('--orange'),
    pulse: token('--sand'),
    manual: token('--orange-3'),
  }
  private resolution = new THREE.Vector2(1, 1)
  private fatMats: LineMaterial[] = []
  private hoverLine: LineSegments2
  private seamLine: LineSegments2
  private selLine: LineSegments2
  private manualLine: LineSegments2
  private sphere = new THREE.SphereGeometry(1, 16, 12)
  private cone = new THREE.ConeGeometry(1, 3, 16)
  private markerMats: { seam: THREE.MeshBasicMaterial; selected: THREE.MeshBasicMaterial; manual: THREE.MeshBasicMaterial }

  // GPU picking: candidates under the pointer, depth-tested against the mesh, so hidden edges never pick.
  private pickScene = new THREE.Scene()
  private pickPart = new THREE.Group()
  private pickOffset = new THREE.Group()
  private depthMat = new THREE.MeshBasicMaterial({ colorWrite: false, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 })
  private depthMesh: THREE.Mesh | null = null
  private pickLines: THREE.LineSegments | null = null
  private pickMat = new THREE.LineBasicMaterial({ vertexColors: true })
  private pickTarget = new THREE.WebGLRenderTarget(1, 1)
  private pickBuf = new Uint8Array(4)
  private raycaster = new THREE.Raycaster()

  private radius = 1
  private showLines = true
  private wireframe = false
  private frame = 0
  private pulseTimer = 0
  private observer: ResizeObserver
  private host: HTMLElement
  private onChipClick: (seamId: string) => void

  constructor(host: HTMLElement, opts: { onContextLost: () => void; onChipClick: (seamId: string) => void }) {
    this.host = host
    this.onChipClick = opts.onChipClick
    this.renderer = new THREE.WebGLRenderer({ antialias: true })
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2))
    const canvas = this.renderer.domElement
    canvas.addEventListener('webglcontextlost', (e) => {
      e.preventDefault()
      opts.onContextLost()
    })
    host.appendChild(canvas)
    this.labels.domElement.className = 'chip-layer'
    host.appendChild(this.labels.domElement)

    this.scene.background = token('--bg')
    this.scene.add(new THREE.HemisphereLight(token('--sand'), token('--forest-4'), 1.4))
    this.scene.add(this.persp, this.ortho, this.part)
    this.persp.add(this.key)
    this.part.rotation.x = -Math.PI / 2 // STL is Z-up, three.js is Y-up
    this.part.add(this.offset)
    this.offset.add(this.markers, this.chips)
    this.pickPart.rotation.x = -Math.PI / 2
    this.pickPart.add(this.pickOffset)
    this.pickScene.add(this.pickPart)

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
    this.wire = new THREE.MeshBasicMaterial({ color: token('--sand-4'), wireframe: true, side: THREE.DoubleSide })
    this.markerMats = {
      seam: new THREE.MeshBasicMaterial({ color: this.colors.seam }),
      selected: new THREE.MeshBasicMaterial({ color: this.colors.selected }),
      manual: new THREE.MeshBasicMaterial({ color: this.colors.manual }),
    }
    this.hoverLine = this.fatLine(this.colors.selected, 3)
    this.seamLine = this.fatLine(this.colors.seam, 3)
    this.selLine = this.fatLine(this.colors.selected, 4)
    this.manualLine = this.fatLine(this.colors.manual, 2)

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
    if (this.depthMesh) {
      this.pickOffset.remove(this.depthMesh)
      this.depthMesh = null
    }
    this.setCandidates([])
    this.setHover(null)
    this.setSeams([], null)
    this.setManual([])
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
    this.depthMesh = new THREE.Mesh(geometry, this.depthMat) // shares the mesh's buffers
    this.pickOffset.add(this.depthMesh)
    this.pickOffset.position.copy(this.offset.position)

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
    if (this.pickLines) {
      this.pickOffset.remove(this.pickLines)
      this.pickLines.geometry.dispose() // the shared position buffer goes with the lines above
      this.pickLines = null
    }
    let segments = 0
    for (const c of candidates) segments += c.points.length - 1 + (c.closed ? 1 : 0)
    if (segments > 0) {
      const pos = new Float32Array(segments * 6)
      const col = new Float32Array(segments * 6)
      const ids = new Float32Array(segments * 6) // id + 1 as 24-bit RGB; 0 = nothing
      let o = 0
      for (const c of candidates) {
        const { r, g, b } = c.kind === 'boundary' ? this.colors.boundary : this.colors.crease
        const v = c.id + 1
        const ir = (v & 255) / 255, ig = ((v >> 8) & 255) / 255, ib = ((v >> 16) & 255) / 255
        const n = c.points.length
        for (let i = 0; i < n - 1 + (c.closed ? 1 : 0); i++) {
          for (const p of [c.points[i], c.points[(i + 1) % n]]) {
            pos.set(p, o)
            col.set([r, g, b], o)
            ids.set([ir, ig, ib], o)
            o += 3
          }
        }
      }
      const position = new THREE.BufferAttribute(pos, 3)
      const geometry = new THREE.BufferGeometry()
      geometry.setAttribute('position', position)
      geometry.setAttribute('color', new THREE.BufferAttribute(col, 3))
      this.lines = new THREE.LineSegments(geometry, this.lineMat)
      this.lines.visible = this.showLines
      this.offset.add(this.lines)
      const pickGeometry = new THREE.BufferGeometry()
      pickGeometry.setAttribute('position', position)
      pickGeometry.setAttribute('color', new THREE.BufferAttribute(ids, 3))
      this.pickLines = new THREE.LineSegments(pickGeometry, this.pickMat)
      this.pickOffset.add(this.pickLines)
    }
    this.requestRender()
  }

  setCandidatesVisible(visible: boolean) {
    this.showLines = visible
    if (this.lines) this.lines.visible = visible
    this.requestRender()
  }

  /** Thick orange overlay on the hovered candidate. */
  setHover(c: Candidate | null) {
    this.setFat(this.hoverLine, c ? [c] : [])
  }

  setSeams(seams: Seam[], selectedId: string | null) {
    const selected = seams.find((s) => s.id === selectedId)
    this.setFat(this.seamLine, seams.filter((s) => s !== selected))
    this.setFat(this.selLine, selected ? [selected] : [])
    this.selLine.material.color.copy(this.colors.selected)

    for (const m of this.markers.children.filter((c) => !c.userData.manual)) this.markers.remove(m)
    for (const c of [...this.chips.children]) {
      this.chips.remove(c)
      ;(c as CSS2DObject).element.remove()
    }
    const r = this.radius * 0.008
    seams.forEach((s, i) => {
      const isSel = s === selected
      const start = new THREE.Mesh(this.sphere, isSel ? this.markerMats.selected : this.markerMats.seam)
      start.position.set(...s.points[0])
      start.scale.setScalar(r)
      this.markers.add(start)
      if (isSel && s.points.length > 1) {
        // direction cone: at the end of an open seam, or one step into a loop
        const [a, b] = s.closed ? [s.points[0], s.points[1]] : [s.points[s.points.length - 2], s.points[s.points.length - 1]]
        const dir = new THREE.Vector3(b[0] - a[0], b[1] - a[1], b[2] - a[2]).normalize()
        const cone = new THREE.Mesh(this.cone, this.markerMats.selected)
        cone.scale.setScalar(r * 1.2)
        cone.quaternion.setFromUnitVectors(Y, dir)
        cone.position.set(...(s.closed ? s.points[1] : b))
        this.markers.add(cone)
      }
      const el = document.createElement('button')
      el.type = 'button'
      el.className = isSel ? 'chip is-selected' : 'chip'
      el.textContent = String(i + 1)
      el.title = `${s.name}: select`
      el.addEventListener('pointerdown', (e) => e.stopPropagation())
      el.addEventListener('click', () => this.onChipClick(s.id))
      const label = new CSS2DObject(el)
      label.position.set(...s.points[0])
      label.center.set(-0.15, 1.15) // up and to the right of the start point
      this.chips.add(label)
    })
    this.requestRender()
  }

  /** Brief highlight of the selected seam (skipped under reduced motion). */
  pulse() {
    if (reducedMotion() || !this.selLine.visible) return
    clearTimeout(this.pulseTimer)
    this.selLine.material.color.copy(this.colors.pulse)
    this.requestRender()
    this.pulseTimer = window.setTimeout(() => {
      this.selLine.material.color.copy(this.colors.selected)
      this.requestRender()
    }, 300)
  }

  /** In-progress manual seam: preview line and point markers; the first point is the close target. */
  setManual(points: { p: Vec3 }[]) {
    this.setFat(this.manualLine, points.length > 1 ? [{ points: points.map((m) => m.p), closed: false }] : [])
    for (const m of this.markers.children.filter((c) => c.userData.manual)) this.markers.remove(m)
    const r = this.radius * 0.006
    points.forEach(({ p }, i) => {
      const dot = new THREE.Mesh(this.sphere, this.markerMats.manual)
      dot.userData.manual = true
      dot.position.set(...p)
      dot.scale.setScalar(i === 0 ? r * 1.6 : r)
      this.markers.add(dot)
    })
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
    for (const cam of [this.persp, this.ortho]) {
      cam.near = r / 100
      cam.far = r * 100
    }
    this.key.position.set(-r, r * 1.5, 0) // upper left of the view
    this.controls.minDistance = r * 0.05
    this.controls.maxDistance = r * 20
    this.controls.minZoom = 0.05
    this.controls.maxZoom = 50
    this.frame3d(new THREE.Vector3(), r, resetView ? ISO.clone() : undefined)
  }

  /** Frame a set of part-coordinate points (a seam), keeping the view direction. */
  fitPoints(points: Vec3[]) {
    if (!points.length) return
    const box = new THREE.Box3().setFromPoints(points.map((p) => this.offset.localToWorld(new THREE.Vector3(...p))))
    const sphere = box.getBoundingSphere(new THREE.Sphere())
    this.frame3d(sphere.center, Math.max(sphere.radius * 1.3, this.radius * 0.05))
  }

  /** Candidate id under the pointer (within a few pixels), or null. Only visible edges count. */
  pickCandidate(clientX: number, clientY: number): number | null {
    if (!this.pickLines || !this.showLines) return null
    const canvas = this.renderer.domElement
    const rect = canvas.getBoundingClientRect()
    const dpr = this.renderer.getPixelRatio()
    const x = (clientX - rect.left) * dpr
    const y = (clientY - rect.top) * dpr
    if (x < 0 || y < 0 || x >= canvas.width || y >= canvas.height) return null
    const r = Math.max(2, Math.round(PICK_RADIUS_PX * dpr))
    const size = 2 * r + 1
    if (this.pickBuf.length !== size * size * 4) {
      this.pickTarget.setSize(size, size)
      this.pickBuf = new Uint8Array(size * size * 4)
    }
    const cam = this.camera
    cam.updateMatrixWorld()
    cam.setViewOffset(canvas.width, canvas.height, x - r, y - r, size, size)
    this.renderer.setRenderTarget(this.pickTarget)
    this.renderer.render(this.pickScene, cam)
    this.renderer.setRenderTarget(null)
    cam.clearViewOffset()
    this.renderer.readRenderTargetPixels(this.pickTarget, 0, 0, size, size, this.pickBuf)
    let best = -1
    let bestD = r * r + 1
    for (let j = 0; j < size; j++)
      for (let i = 0; i < size; i++) {
        const o = (j * size + i) * 4
        const id = this.pickBuf[o] | (this.pickBuf[o + 1] << 8) | (this.pickBuf[o + 2] << 16)
        const d = (i - r) ** 2 + (j - r) ** 2
        if (id && d < bestD) {
          bestD = d
          best = id - 1
        }
      }
    return best >= 0 ? best : null
  }

  /** Point and outward normal on the mesh under the pointer, in part coordinates. */
  pickSurface(clientX: number, clientY: number): { p: Vec3; n: Vec3 } | null {
    if (!this.mesh) return null
    const rect = this.renderer.domElement.getBoundingClientRect()
    const ndc = new THREE.Vector2(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1)
    this.camera.updateMatrixWorld()
    this.raycaster.setFromCamera(ndc, this.camera)
    const hit = this.raycaster.intersectObject(this.mesh, false)[0]
    if (!hit?.face) return null
    const p = this.offset.worldToLocal(hit.point.clone())
    const n = hit.face.normal.clone() // mesh space is part space (offset only translates)
    if (n.clone().transformDirection(this.mesh.matrixWorld).dot(this.raycaster.ray.direction) > 0) n.negate() // face toward the viewer
    return { p: [p.x, p.y, p.z], n: [n.x, n.y, n.z] }
  }

  /** Client (page) coordinates of a part-coordinate point. */
  toClient(p: Vec3): { x: number; y: number } {
    const v = this.offset.localToWorld(new THREE.Vector3(...p)).project(this.camera)
    const rect = this.renderer.domElement.getBoundingClientRect()
    return { x: rect.left + ((v.x + 1) / 2) * rect.width, y: rect.top + ((1 - v.y) / 2) * rect.height }
  }

  dispose() {
    clearTimeout(this.pulseTimer)
    this.observer.disconnect()
    this.controls.dispose()
    this.setMesh(null)
    cancelAnimationFrame(this.frame) // after setMesh(null), which queues a frame
    for (const m of [this.solid, this.wire, this.lineMat, this.depthMat, this.pickMat, ...this.fatMats, ...Object.values(this.markerMats)]) m.dispose()
    for (const l of [this.hoverLine, this.seamLine, this.selLine, this.manualLine]) l.geometry.dispose()
    this.sphere.dispose()
    this.cone.dispose()
    this.pickTarget.dispose()
    this.renderer.dispose()
    this.renderer.domElement.remove()
    this.labels.domElement.remove()
  }

  private fatLine(color: THREE.Color, width: number) {
    const mat = new LineMaterial({ color: color.getHex(), linewidth: width, worldUnits: false })
    mat.color.copy(color)
    mat.resolution.copy(this.resolution)
    this.fatMats.push(mat)
    const line = new LineSegments2(new LineSegmentsGeometry(), mat)
    line.visible = false
    line.renderOrder = 1
    this.offset.add(line)
    return line
  }

  private setFat(line: LineSegments2, polylines: Polyline[]) {
    const segs: number[] = []
    for (const { points, closed } of polylines) {
      const n = points.length
      for (let i = 0; i < n - 1 + (closed && n > 2 ? 1 : 0); i++) segs.push(...points[i], ...points[(i + 1) % n])
    }
    line.geometry.dispose()
    line.geometry = new LineSegmentsGeometry()
    if (segs.length) line.geometry.setPositions(segs)
    line.visible = segs.length > 0
    this.requestRender()
  }

  /** Put the camera `r` around `center` (world), along `dir` or the current view direction. */
  private frame3d(center: THREE.Vector3, r: number, dir?: THREE.Vector3) {
    const target = this.controls.target
    const d = dir ?? this.camera.position.clone().sub(target).normalize()
    if (d.lengthSq() < 0.5) d.copy(ISO)
    const halfV = THREE.MathUtils.degToRad(FOV / 2)
    const halfH = Math.atan(Math.tan(halfV) * this.aspect())
    const dist = (r / Math.sin(Math.min(halfV, halfH))) * 1.05
    target.copy(center)
    for (const cam of [this.persp, this.ortho]) {
      cam.position.copy(center).addScaledVector(d, dist)
      cam.lookAt(center)
    }
    this.ortho.zoom = this.radius / r
    this.updateProjection()
    this.controls.update()
    this.requestRender()
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
    this.labels.setSize(w, h)
    this.resolution.set(w, h)
    for (const m of this.fatMats) m.resolution.set(w, h)
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
    this.labels.render(this.scene, this.camera)
  }
}

/** Round up to 1, 2 or 5 × 10^n so grid cells land on readable sizes. */
function niceCeil(v: number) {
  const p = 10 ** Math.floor(Math.log10(v || 1))
  return ([1, 2, 5, 10].find((m) => m * p >= v) ?? 10) * p
}
