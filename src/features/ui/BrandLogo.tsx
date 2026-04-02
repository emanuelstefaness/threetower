"use client";

import Image from "next/image";

export function BrandLogo() {
  return (
    <div className="logo">
      <Image
        src="/three-tower-logo.png"
        alt=""
        width={32}
        height={32}
        className="logo-mark"
        priority
      />
      Three <span>Tower</span>
    </div>
  );
}
