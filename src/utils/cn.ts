import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export const cn = (...inputs: ClassValue[]): string => twMerge(clsx(inputs));

const LEGACY_TOKENS = new Set([
    'btn',
    'primary',
    'secondary',
    'outline',
    'ghost',
    'danger',
    'success',
    'sm',
    'lg',
    'card',
    'form-input',
    'filter-search',
    'pagination',
    'responsive-pagination',
]);

export const stripLegacyClasses = (className?: string): string =>
    (className || '')
        .split(/\s+/)
        .filter(token => token && !LEGACY_TOKENS.has(token))
        .join(' ');
