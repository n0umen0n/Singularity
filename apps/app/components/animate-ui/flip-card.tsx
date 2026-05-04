"use client";

import { easeOut, motion } from "motion/react";
import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { cx } from "@singularity/ui";

type FlipCardProps = {
  front: ReactNode;
  back: ReactNode;
  className?: string;
  innerClassName?: string;
};

const cardVariants = {
  front: { rotateY: 0, transition: { duration: 0.5, ease: easeOut } },
  back: { rotateY: 180, transition: { duration: 0.5, ease: easeOut } },
};

export function FlipCard({ front, back, className, innerClassName }: FlipCardProps) {
  const [isFlipped, setIsFlipped] = useState(false);
  const [isTouchDevice, setIsTouchDevice] = useState(false);

  useEffect(() => {
    setIsTouchDevice("ontouchstart" in window || navigator.maxTouchPoints > 0);
  }, []);

  return (
    <div
      className={cx("animate-ui-flip-card", className)}
      onClick={() => {
        if (isTouchDevice) setIsFlipped((value) => !value);
      }}
      onFocus={() => {
        if (!isTouchDevice) setIsFlipped(true);
      }}
      onBlur={() => {
        if (!isTouchDevice) setIsFlipped(false);
      }}
      onMouseEnter={() => {
        if (!isTouchDevice) setIsFlipped(true);
      }}
      onMouseLeave={() => {
        if (!isTouchDevice) setIsFlipped(false);
      }}
      tabIndex={0}
    >
      <motion.div
        animate={isFlipped ? "back" : "front"}
        className={cx("animate-ui-flip-card-inner", innerClassName)}
        initial="front"
        variants={cardVariants}
      >
        <div className="animate-ui-flip-card-face">{front}</div>
        <div className="animate-ui-flip-card-face animate-ui-flip-card-back">{back}</div>
      </motion.div>
    </div>
  );
}
