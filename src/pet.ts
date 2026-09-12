import type { Pet } from './types';

// Original SVG artwork: tiny, editable, and sharp on Retina / HiDPI displays.
export function petSvg(pet: Pet): string {
  const dog = pet === 'dog';
  return `<svg viewBox="0 0 180 160" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" class="pet-art ${pet}">
    <ellipse cx="90" cy="146" rx="52" ry="7" fill="#453c32" opacity=".1"/>
    <g class="pet-body" stroke="#644b3b" stroke-width="3.5" stroke-linejoin="round">
      <path class="tail" d="${dog ? 'M128 121 Q161 91 155 117 Q149 137 129 135' : 'M129 134 Q164 137 156 108 Q151 98 146 109'}" fill="${dog ? '#d0a070' : 'none'}" stroke-width="9" stroke-linecap="round"/>
      <path d="M56 110 Q44 139 61 143 H120 Q137 136 123 109" fill="${dog ? '#eac49a' : '#c5c9d5'}"/>
      <ellipse cx="88" cy="124" rx="20" ry="17" fill="#fff5e7" stroke="none"/>
      <path d="M59 129 V140 M117 129 V140" stroke-linecap="round"/>
      ${dog ? '<path d="M48 53 Q19 42 26 86 Q29 107 47 87 M127 53 Q154 41 153 81 Q153 104 135 92" fill="#a9744e"/>' : '<path d="M45 60 L43 22 L74 43 M109 44 L137 23 L138 65" fill="#c5c9d5"/><path d="M51 45 L51 34 L65 46 M120 46 L131 34 L131 49" stroke="#dfacae" stroke-width="6"/>'}
      <path d="M43 67 Q44 39 89 39 Q135 39 138 72 V86 Q137 115 90 116 Q43 116 42 87 Z" fill="${dog ? '#eac49a' : '#c5c9d5'}"/>
      ${dog ? '<ellipse cx="70" cy="71" rx="16" ry="19" fill="#c59163" stroke="none"/>' : '<path d="M79 42 L83 53 M93 42 V52 M106 44 L103 54" stroke="#969cad" stroke-width="5" stroke-linecap="round"/>'}
      <g class="eyes" fill="#40362e" stroke="none"><ellipse cx="68" cy="77" rx="4" ry="6"/><ellipse cx="111" cy="77" rx="4" ry="6"/></g>
      <ellipse cx="57" cy="90" rx="9" ry="5" fill="#e6a5a0" stroke="none" opacity=".7"/>
      <ellipse cx="124" cy="90" rx="9" ry="5" fill="#e6a5a0" stroke="none" opacity=".7"/>
      <path d="M85 88 Q90 84 95 88 L90 93 Z" fill="#644b3b" stroke-width="2"/>
      <path d="M90 93 Q86 102 80 96 M90 93 Q94 102 100 96" fill="none" stroke-width="2.5" stroke-linecap="round"/>
      <path d="M69 114 Q90 122 113 114" stroke="${dog ? '#88a887' : '#b89abd'}" stroke-width="7" fill="none"/>
      <circle cx="91" cy="119" r="5" fill="#f8db86" stroke-width="2"/>
    </g>
  </svg>`;
}
