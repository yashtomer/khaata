import React from 'react';
import Svg, { Path } from 'react-native-svg';

interface IconProps {
  paths: string[];
  color?: string;
  size?: number;
  strokeWidth?: number;
}

export function Icon({ paths, color = '#000', size = 24, strokeWidth = 1.9 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
      {paths.map((d, i) => (
        <Path key={i} d={d} />
      ))}
    </Svg>
  );
}
