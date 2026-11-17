'use client';

import Image from 'next/image';
import { useState } from 'react';
import styles from './gia-avatar.module.css';

/** Decorative avatar: the adjacent GIA label supplies the accessible name. */
export function GiaAvatar({ small = false, className = '' }: { small?: boolean; className?: string }) {
  const [failed, setFailed] = useState(false);
  return (
    <span className={`${styles.avatar} ${small ? styles.small : ''} ${className}`} aria-hidden="true" data-testid="gia-avatar" data-fallback={failed}>
      <span>G</span>
      {!failed && <Image src="/spike-preview/gia-avatar.webp" alt="" fill unoptimized sizes={small ? '28px' : '36px'} onError={() => setFailed(true)} />}
    </span>
  );
}
