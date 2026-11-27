import DOMPurify from 'dompurify';

export function escapeHtml(str: unknown): string {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function sanitizeHtml(dirty: string | null | undefined): string {
  const input = String(dirty ?? '');
  if (!input) return '';
  return DOMPurify.sanitize(input, {
    USE_PROFILES: { html: true },
    ADD_ATTR: [
      'target',
      'rel',
      'class',
      'style',
      'data-mention-id',
      'data-user-id',
      'data-entity-type',
      'data-entity-id',
      'data-file-url',
      'data-file-name',
      'data-mention-avatar',
      'data-open-workspace-file',
      'download',
      'contenteditable',
      'colspan',
      'rowspan',
      'align',
      'valign',
      'width',
      'height',
      'cellpadding',
      'cellspacing',
      'border',
      'bgcolor',
    ],
    FORBID_TAGS: [
      'script',
      'iframe',
      'object',
      'embed',
      'form',
      'input',
      'button',
      'textarea',
      'select',
      'base',
      'meta',
      'link',
      'style',
    ],
    FORBID_ATTR: [
      'onerror',
      'onload',
      'onclick',
      'onmouseover',
      'onfocus',
      'onblur',
      'onmouseenter',
      'onanimationstart',
      'formaction',
    ],
  });
}
