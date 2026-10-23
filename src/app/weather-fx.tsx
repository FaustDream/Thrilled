/**
 * 天气动效组件（纯 CSS + inline SVG，无第三方资源）
 *
 * 两层结构，与动效预算匹配：
 * - WeatherGlyph：图标层，卡片与详情共用；太阳旋转 / 云漂移 / 雨丝下落 / 雪花摆动 / 闪电瞬闪。
 * - WeatherScene：背景场景层，只在天气详情的大卡里挂载；雨雪雾用少量循环粒子，晴热用光晕。
 *
 * 约束：只动 transform / opacity；离开视口或切到后台时暂停；prefers-reduced-motion 降级为静态。
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import type { WeatherFx, WeatherFxKind } from '../core/weather-fx'

/** 可见性 + 后台标签页：两者任一不满足就暂停 CSS 动画（元素卸载时观察器自动断开） */
function useMotionActive<T extends Element>(): { ref: (el: T | null) => void; active: boolean } {
  const [el, setEl] = useState<T | null>(null)
  const [active, setActive] = useState(true)
  const ref = useCallback((node: T | null) => { setEl(node) }, [])
  useEffect(() => {
    if (el === null) return
    const io = new IntersectionObserver((entries) => {
      const e = entries[0]
      if (e !== undefined) setActive(e.isIntersecting && !document.hidden)
    })
    io.observe(el)
    const onVis = (): void => setActive(!document.hidden)
    document.addEventListener('visibilitychange', onVis)
    return () => {
      io.disconnect()
      document.removeEventListener('visibilitychange', onVis)
    }
  }, [el])
  return { ref, active }
}

const SunGlyph = () => (
  <g className="wx-sun">
    <g className="wx-rays">
      {[0, 45, 90, 135, 180, 225, 270, 315].map((a) => (
        <rect key={a} x="31.1" y="13" width="1.8" height="7.5" rx=".9" transform={`rotate(${a} 32 30)`} />
      ))}
    </g>
    <circle className="wx-sun-core" cx="32" cy="30" r="10.5" />
  </g>
)

const CloudGlyph = ({ back = false }: { back?: boolean }) => (
  <g className={back ? 'wx-cloud back' : 'wx-cloud'}>
    <circle cx="22" cy="37" r="8" />
    <circle cx="33" cy="31" r="11" />
    <circle cx="44" cy="37" r="8" />
    <rect x="22" y="36" width="22" height="9" rx="4.5" />
  </g>
)

const MoonGlyph = () => (
  <g className="wx-moon-group">
    <path className="wx-moon" d="M41.4 12.4a16.4 16.4 0 1 0 10.2 29.2A18.2 18.2 0 0 1 41.4 12.4z" />
    <circle className="wx-star s1" cx="15" cy="17" r="1.4" />
    <circle className="wx-star s2" cx="56" cy="13" r="1.1" />
    <circle className="wx-star s3" cx="12" cy="46" r="1.3" />
  </g>
)

const RainGlyph = () => (
  <g className="wx-drops" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
    <line className="wx-drop" x1="25" y1="46" x2="23" y2="53" />
    <line className="wx-drop" x1="33" y1="47" x2="31" y2="55" />
    <line className="wx-drop" x1="41" y1="46" x2="39" y2="53" />
  </g>
)

const SnowGlyph = () => (
  <g className="wx-flakes" fill="currentColor">
    <circle className="wx-flake" cx="25" cy="48" r="2" />
    <circle className="wx-flake" cx="33" cy="50" r="1.7" />
    <circle className="wx-flake" cx="41" cy="47" r="2.1" />
  </g>
)

const FogGlyph = () => (
  <g className="wx-fog" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round">
    <line className="wx-fog-band" x1="17" y1="34" x2="46" y2="34" />
    <line className="wx-fog-band" x1="22" y1="42" x2="51" y2="42" />
    <line className="wx-fog-band" x1="17" y1="50" x2="43" y2="50" />
  </g>
)

const kindClass = (kind: WeatherFxKind): string => `wx-glyph wx-g-${kind}`

/**
 * 图标层：尺寸完全由父容器决定（卡片按 --u 缩放，详情固定 76px）。
 * 颜色只随现象变化；夜间 / 高温 / 零下只加修饰类，不换整套图形。
 */
export const WeatherGlyph = ({ fx, muted = false }: { fx: WeatherFx; muted?: boolean }) => {
  const { ref, active } = useMotionActive<SVGSVGElement>()
  const cls = `${kindClass(fx.kind)}${fx.night ? ' is-night' : ''}${fx.hot ? ' is-hot' : ''}${fx.cold ? ' is-cold' : ''}${muted ? ' is-muted' : ''}`
  return (
    <svg ref={ref} className={cls} data-active={active} viewBox="0 0 64 64" aria-hidden="true" focusable="false">
      {fx.kind === 'clear' && (fx.night ? <MoonGlyph /> : <SunGlyph />)}
      {fx.kind === 'partly' && (
        <>
          <g transform="translate(-7 -9)">{fx.night ? <MoonGlyph /> : <SunGlyph />}</g>
          <g transform="translate(4 7) scale(.86)"><CloudGlyph /></g>
        </>
      )}
      {fx.kind === 'cloudy' && (
        <>
          <g transform="translate(-5 -5)" opacity=".45"><CloudGlyph back /></g>
          <g transform="translate(3 3)"><CloudGlyph /></g>
        </>
      )}
      {(fx.kind === 'rain' || fx.kind === 'thunder') && (
        <>
          <g transform="translate(0 -5)"><CloudGlyph /></g>
          {fx.kind === 'rain' ? <RainGlyph /> : (
            <path className="wx-bolt" d="M34 42l-7 10h5.4l-2.2 7 9.4-11.6h-5.2L37 42z" />
          )}
        </>
      )}
      {fx.kind === 'snow' && (
        <>
          <g transform="translate(0 -5)"><CloudGlyph /></g>
          <SnowGlyph />
        </>
      )}
      {fx.kind === 'fog' && <FogGlyph />}
      {fx.cold && fx.kind !== 'snow' && (
        <g className="wx-frost" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round">
          <path d="M11 51l3 3M14 51l-3 3M50 49l2.6 2.6M52.6 49l-2.6 2.6" />
        </g>
      )}
    </svg>
  )
}

interface Particle {
  left: number
  delay: number
  dur: number
  size: number
}

const seedParticles = (count: number, baseDur: number): Particle[] => Array.from({ length: count }, (_, i) => ({
  left: (i * 47 + 11) % 100,
  delay: -((i * 0.31) % 2.6),
  dur: baseDur + (i % 5) * baseDur * 0.16,
  size: 2 + (i % 3),
}))

/** 雨丝：参数只改密度 / 时长 / 长度，DOM 节点固定复用 */
const SceneRain = ({ drops }: { drops: Particle[] }) => (
  <>
    {drops.map((p, i) => (
      <i key={i} className="wx-scene-drop" style={{
        left: `${p.left}%`,
        animationDelay: `${p.delay}s`,
        animationDuration: `${p.dur}s`,
        ['--h' as string]: `${10 + (i % 4) * 4}px`,
      }} />
    ))}
  </>
)

/** 雪花：多层速度 + 横向摆动，全部走 transform / opacity */
const SceneSnow = ({ flakes }: { flakes: Particle[] }) => (
  <>
    {flakes.map((p, i) => (
      <i key={i} className="wx-scene-flake" style={{
        left: `${p.left}%`,
        animationDelay: `${p.delay}s`,
        animationDuration: `${p.dur}s`,
        ['--s' as string]: `${2 + (i % 3)}px`,
      }} />
    ))}
  </>
)

/** 夜间星点：颜色跟随面板文字，深浅皮肤都能看见 */
const SceneStars = ({ stars }: { stars: Particle[] }) => (
  <>
    {stars.map((p, i) => (
      <i key={i} className="wx-scene-star" style={{
        left: `${p.left}%`,
        top: `${8 + (i * 17) % 58}%`,
        animationDelay: `${p.delay}s`,
        animationDuration: `${p.dur}s`,
      }} />
    ))}
  </>
)

/**
 * 背景场景层：只在天气详情的 hero 区域渲染，粒子数量按强度 20–34 个，
 * 全部是循环复用的 span，不再动态创建 / 销毁（参数化做法，避免掉帧）。
 */
export const WeatherScene = ({ fx }: { fx: WeatherFx }) => {
  const { ref, active } = useMotionActive<HTMLDivElement>()
  const drops = useMemo(() => seedParticles(16 + fx.intensity * 6, 0.9), [fx.intensity])
  const flakes = useMemo(() => seedParticles(18 + fx.intensity * 4, 4.2), [fx.intensity])
  const stars = useMemo(() => seedParticles(10, 2.8), [])
  const cloudy = fx.kind === 'partly' || fx.kind === 'cloudy'
  const rainy = fx.kind === 'rain' || fx.kind === 'thunder'
  const cls = `wx-scene wx-scene-${fx.kind}${fx.night ? ' is-night' : ''}${fx.hot ? ' is-hot' : ''}${fx.cold ? ' is-cold' : ''}`
  return (
    <div ref={ref} className={cls} data-active={active} aria-hidden="true">
      <i className="wx-scene-glow" />
      {(fx.kind === 'clear' || fx.kind === 'partly') && <i className="wx-scene-halo" />}
      {cloudy && <><i className="wx-scene-cloud c1" /><i className="wx-scene-cloud c2" /><i className="wx-scene-cloud c3" /></>}
      {rainy && <SceneRain drops={drops} />}
      {fx.kind === 'snow' && <SceneSnow flakes={flakes} />}
      {fx.kind === 'fog' && <><i className="wx-scene-fog f1" /><i className="wx-scene-fog f2" /><i className="wx-scene-fog f3" /></>}
      {fx.night && fx.kind !== 'fog' && <SceneStars stars={stars} />}
      {fx.hot && <><i className="wx-scene-heat h1" /><i className="wx-scene-heat h2" /></>}
      {fx.cold && <i className="wx-scene-frost" />}
      {fx.kind === 'thunder' && <i className="wx-scene-flash" />}
    </div>
  )
}
