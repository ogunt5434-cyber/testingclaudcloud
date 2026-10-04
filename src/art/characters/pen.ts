// SVG string builder with the cartoon "ink + cel shade" treatment used by every character part.
import { light as lightOf, mix, shade as shadeOf } from './color';
import { f, type Pt } from './geom';

export const OUTLINE = '#1d1530';
/** Visible outline is half the stroke (paint-order: stroke puts the fill over the inner half). */
export const STROKE = 5.6;
/** Placeholder replaced per instance so clip/gradient ids stay unique in the document. */
export const UID = '__U__';

export interface ShapeOpts {
  /** Shadow tone; null draws a flat fill. Default: shade(fill). */
  shade?: string | null;
  /** Width of the shadow rim (the lit copy is shifted by this up-right). Default 3. */
  off?: number;
  /** Shift direction of the lit copy (x, y). Default up-right. */
  dir?: Pt;
  /** Outline stroke width (visible part is half). */
  sw?: number;
  /** Glossy rim light along the top-right edge. */
  rim?: string;
  rimW?: number;
  /** Extra markup drawn inside the shape's clip (patterns, trims, spots). */
  inner?: string;
  /** No outline at all. */
  noStroke?: boolean;
  opacity?: number;
  cls?: string;
}

/** Ink line of a shape: a deep, hue-tinted version of its own fill (not one global black). */
export function inkFor(fill: string): string {
  return fill.startsWith('#') ? mix(fill, OUTLINE, 0.8) : OUTLINE;
}

export class Pen {
  private readonly out: string[] = [];
  private n = 0;
  /** Id of a soft radial sheen gradient laid over every shaded shape (painted-volume look). */
  sheen?: string;
  /** Reflected light tint on the shadow side (the hero's faction glow); null = none. */
  rimTint: string | null = null;
  /** Soft form gradients per fill colour (lit side and shadow side), defined once per sprite. */
  private readonly litGrads = new Map<string, string>();
  private readonly shadeGrads = new Map<string, string>();

  constructor(private readonly key: string) {}

  /** Lit fill: lighter toward the light (upper right), falling off toward the shadow side. */
  private litFill(fill: string): string {
    if (!fill.startsWith('#')) return fill;
    let id = this.litGrads.get(fill);
    if (!id) {
      id = this.id('lg');
      this.litGrads.set(fill, id);
      this.out.push(
        `<defs><linearGradient id="${id}" x1=".85" y1="0" x2=".2" y2="1"><stop offset="0" stop-color="${lightOf(fill, 0.2)}"/><stop offset=".5" stop-color="${fill}"/><stop offset="1" stop-color="${mix(fill, shadeOf(fill), 0.38)}"/></linearGradient></defs>`,
      );
    }
    return `url(#${id})`;
  }

  /** Shadow fill: the cel-shadow tone, picking up a faction-tinted reflected light at the far edge. */
  private shadeFill(sh: string): string {
    if (!this.rimTint || !sh.startsWith('#')) return sh;
    let id = this.shadeGrads.get(sh);
    if (!id) {
      id = this.id('sg');
      this.shadeGrads.set(sh, id);
      this.out.push(
        `<defs><linearGradient id="${id}" x1=".8" y1="0" x2=".1" y2="1"><stop offset="0" stop-color="${sh}"/><stop offset=".62" stop-color="${sh}"/><stop offset="1" stop-color="${mix(sh, this.rimTint, 0.42)}"/></linearGradient></defs>`,
      );
    }
    return `url(#${id})`;
  }

  /** Defines the shared sheen gradient for this sprite. */
  defineSheen(): void {
    const id = this.id('sh');
    this.sheen = id;
    this.out.push(
      `<defs><radialGradient id="${id}" cx=".7" cy=".22" r=".8"><stop offset="0" stop-color="#fff" stop-opacity=".34"/><stop offset=".45" stop-color="#fff" stop-opacity=".1"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient></defs>`,
    );
  }

  /** Outlined, cel-shaded shape. */
  shape(d: string, fill: string, o: ShapeOpts = {}): this {
    const sh = o.shade === undefined ? shadeOf(fill) : o.shade;
    const attrs =
      (o.sw !== undefined ? ` stroke-width="${f(o.sw)}"` : '') +
      (o.noStroke ? ' stroke="none"' : '') +
      (o.opacity !== undefined ? ` opacity="${o.opacity}"` : '') +
      (o.cls ? ` class="${o.cls}"` : '');
    const needsClip = sh !== null || o.rim || o.inner;
    if (!needsClip) {
      this.out.push(`<path d="${d}" fill="${fill}"${attrs}${o.noStroke ? '' : ` stroke="${inkFor(fill)}"`}/>`);
      return this;
    }
    const id = `${this.key}${this.n++}${UID}`;
    const off = o.off ?? 3;
    const [dx, dy] = o.dir ?? [0.75, -1];
    let inner = '';
    if (sh !== null) inner += `<path d="${d}" fill="${this.litFill(fill)}" transform="translate(${f(dx * off)} ${f(dy * off)})"/>`;
    if (sh !== null && this.sheen) inner += `<path d="${d}" fill="url(#${this.sheen})"/>`;
    if (o.inner) inner += o.inner;
    if (o.rim) {
      const w = o.rimW ?? 2.4;
      inner += `<path d="${d}" fill="none" stroke="${o.rim}" stroke-width="${f(w)}" transform="translate(${f(-w * 0.8)} ${f(w * 0.8)})" opacity=".85"/>`;
    }
    this.out.push(
      `<clipPath id="${id}"><path d="${d}"/></clipPath>` +
        `<g${o.opacity !== undefined ? ` opacity="${o.opacity}"` : ''}${o.cls ? ` class="${o.cls}"` : ''}>` +
        `<path d="${d}" fill="${sh === null ? fill : this.shadeFill(sh)}"${o.sw !== undefined ? ` stroke-width="${f(o.sw)}"` : ''}${o.noStroke ? ' stroke="none"' : ` stroke="${inkFor(fill)}"`}/>` +
        `<g clip-path="url(#${id})" stroke="none">${inner}</g></g>`,
    );
    return this;
  }

  /** Flat fill, no outline (face details, glows). */
  fill(d: string, fill: string, opacity?: number): this {
    this.out.push(`<path d="${d}" fill="${fill}" stroke="none"${opacity !== undefined ? ` opacity="${opacity}"` : ''}/>`);
    return this;
  }

  /** Stroke-only line (brows, mouths, seams). */
  line(d: string, color: string, width: number, opacity?: number): this {
    this.out.push(
      `<path d="${d}" fill="none" stroke="${color}" stroke-width="${f(width)}" stroke-linecap="round" stroke-linejoin="round" paint-order="normal"${opacity !== undefined ? ` opacity="${opacity}"` : ''}/>`,
    );
    return this;
  }

  raw(s: string): this {
    this.out.push(s);
    return this;
  }

  /** Opens an animatable group pivoting at `origin` (viewBox units). */
  open(cls: string, origin?: Pt, attrs = ''): this {
    const style = origin ? ` style="transform-origin:${f(origin[0])}px ${f(origin[1])}px"` : '';
    this.out.push(`<g class="${cls}"${style}${attrs ? ` ${attrs}` : ''}>`);
    return this;
  }

  /** Opens a static positioned group (local coordinate frame). */
  at(x: number, y: number, rot = 0, scale = 1): this {
    const t = `translate(${f(x)} ${f(y)})${rot ? ` rotate(${f(rot)})` : ''}${scale !== 1 ? ` scale(${scale})` : ''}`;
    this.out.push(`<g transform="${t}">`);
    return this;
  }

  close(): this {
    this.out.push('</g>');
    return this;
  }

  /** Unique id for a gradient or filter in this sprite. */
  id(name: string): string {
    return `${this.key}${name}${this.n++}${UID}`;
  }

  toString(): string {
    return this.out.join('');
  }
}
