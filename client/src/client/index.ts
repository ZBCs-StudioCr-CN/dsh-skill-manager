/** Skill manager 插件，浏览器半边：注册设置页的「技能」分区。 */

import { Panel } from './panel'
import { CSS } from './styles'

export const name = 'dsh-skill-manager'

/** 只依赖槽位服务；数据全部走自己的宿主路由。 */
export const inject = ['slots']

/**
 * 注册设置分区。
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

  ctx.slots.inject('settings.section', () =>
    ctx.slots.register(
      {
        name: 'settings.section',
        id: 'dsh-skill-manager',
        order: 62,
        label: () => '技能',
        inject: () => ({}),
      },
      Panel,
    ),
  )
}
