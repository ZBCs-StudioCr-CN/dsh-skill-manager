/** Skill manager 插件，浏览器半边：注册侧边栏一级入口 + 主面板。 */

import { createElement } from 'react'

import { Panel } from './panel'
import { CSS } from './styles'

export const name = 'dsh-skill-manager'

/** 面板 id：同时是主面板的 key 和侧边栏图标行的 id。 */
export const PANEL_ID = 'skill-manager'

/** 只依赖槽位服务；数据全部走自己的宿主路由。 */
export const inject = ['slots']

/**
 * 侧边栏里的入口图标。
 * @param props - 槽位给的尺寸与选中态
 * @returns 图标元素
 */
function PanelIcon(props: { size?: number; active?: boolean }) {
  const size = props?.size ?? 20
  return createElement(
    'svg',
    {
      width: size,
      height: size,
      viewBox: '0 0 24 24',
      fill: 'none',
      'aria-hidden': true,
      style: { display: 'block' },
    },
    createElement('path', {
      d: 'M4 5.5A2.5 2.5 0 0 1 6.5 3H19v18H6.5A2.5 2.5 0 0 1 4 18.5v-13Z',
      stroke: 'currentColor',
      strokeWidth: props?.active ? 2 : 1.6,
      strokeLinejoin: 'round',
    }),
    createElement('path', {
      d: 'M8 8h7M8 12h7M8 16h4',
      stroke: 'currentColor',
      strokeWidth: 1.5,
      strokeLinecap: 'round',
    }),
  )
}

/**
 * 注册一级入口与主面板。
 * @param ctx - 浏览器插件上下文
 */
export function apply(ctx: any): void {
  ctx.effect(() => {
    const tag = document.createElement('style')
    tag.dataset.plugin = 'dsh-skill-manager'
    tag.textContent = CSS
    document.head.appendChild(tag)
    return () => tag.remove()
  }, 'skill-manager: 样式')

  ctx.slots.inject('main', () =>
    ctx.slots.register(
      {
        name: 'main',
        key: PANEL_ID,
        inject: () => ({}),
      },
      Panel,
    ),
  )

  ctx.slots.inject('sidebar.panellist', () =>
    ctx.slots.register(
      {
        name: 'sidebar.panellist',
        id: PANEL_ID,
        order: 40,
        label: () => '技能管理',
        inject: () => ({}),
      },
      PanelIcon,
    ),
  )
}
