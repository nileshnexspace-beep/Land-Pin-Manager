import React from 'react';

interface LogoProps {
  className?: string;
  showText?: boolean;
  variant?: 'light' | 'dark';
}

export default function Logo({ className = '', showText = true, variant = 'dark' }: LogoProps) {
  const textColor = variant === 'light' ? 'text-white' : 'text-neutral-900';
  const iconColor = '#EB5E28'; // Vibrant orange from the image

  return (
    <div className={`flex items-center gap-3 ${className}`}>
      {showText && (
        <span className={`text-3xl font-black tracking-tighter ${textColor}`} style={{ fontFamily: 'system-ui, sans-serif' }}>
          eezily
        </span>
      )}
    </div>
  );
}
