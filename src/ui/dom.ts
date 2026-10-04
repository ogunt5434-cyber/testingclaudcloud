// Tiny DOM helpers used by every UI module (no framework).

export type Child = Node | string | number | null | undefined | false | readonly Child[];

type ClassValue = string | readonly (string | false | null | undefined)[];
type EventMap = { [K in keyof HTMLElementEventMap]?: (ev: HTMLElementEventMap[K]) => void };

export interface Props {
  class?: ClassValue;
  /** CSS properties in kebab-case, custom properties (`--fc`) allowed. Null values are skipped. */
  style?: Record<string, string | number | null | undefined>;
  /** Attributes; `true` sets an empty attribute, false/null/undefined skips it. */
  attrs?: Record<string, string | number | boolean | null | undefined>;
  onClick?: (ev: MouseEvent) => void;
  on?: EventMap;
}

export function classNames(value: ClassValue): string {
  return typeof value === 'string' ? value : value.filter(Boolean).join(' ');
}

function applyProps(el: HTMLElement, props: Props): void {
  if (props.class) el.className = classNames(props.class);
  if (props.style) {
    for (const [key, value] of Object.entries(props.style)) {
      if (value !== null && value !== undefined) el.style.setProperty(key, String(value));
    }
  }
  if (props.attrs) {
    for (const [key, value] of Object.entries(props.attrs)) {
      if (value === true) el.setAttribute(key, '');
      else if (value !== false && value !== null && value !== undefined) el.setAttribute(key, String(value));
    }
  }
  if (props.onClick) el.addEventListener('click', props.onClick);
  if (props.on) {
    for (const [type, listener] of Object.entries(props.on)) {
      if (listener) el.addEventListener(type, listener as EventListener);
    }
  }
}

/** Flattens children into DOM nodes (strings/numbers become text nodes, falsy values are skipped). */
export function toNodes(children: readonly Child[]): Node[] {
  const out: Node[] = [];
  const walk = (child: Child): void => {
    if (child === null || child === undefined || child === false) return;
    if (Array.isArray(child)) (child as readonly Child[]).forEach(walk);
    else if (child instanceof Node) out.push(child);
    else out.push(document.createTextNode(String(child)));
  };
  children.forEach(walk);
  return out;
}

/** Creates an element: h('div', { class: 'x' }, 'text', otherNode). */
export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props?: Props | null,
  ...children: Child[]
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  if (props) applyProps(el, props);
  el.append(...toNodes(children));
  return el;
}

/** Replaces all children of `el`. */
export function mount(el: Element, ...children: Child[]): void {
  el.replaceChildren(...toNodes(children));
}

export function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
}
