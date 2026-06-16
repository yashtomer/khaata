import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Svg, { Path, Circle } from 'react-native-svg';
import { F } from '../src/theme';

interface Segment {
  pct: number;
  color: string;
}

interface DonutChartProps {
  segments: Segment[];
  size: number;
  holeRatio?: number;
  centerLabel?: string;
  centerValue?: string;
  centerSub?: string;
}

function polarToCartesian(cx: number, cy: number, r: number, deg: number) {
  const rad = ((deg - 90) * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

function sectorPath(cx: number, cy: number, r: number, start: number, end: number) {
  if (end - start >= 360) end = start + 359.999;
  const p1 = polarToCartesian(cx, cy, r, start);
  const p2 = polarToCartesian(cx, cy, r, end);
  const large = end - start > 180 ? 1 : 0;
  return `M ${cx} ${cy} L ${p1.x} ${p1.y} A ${r} ${r} 0 ${large} 1 ${p2.x} ${p2.y} Z`;
}

export function DonutChart({ segments, size, holeRatio = 0.6, centerLabel, centerValue, centerSub }: DonutChartProps) {
  const cx = size / 2;
  const cy = size / 2;
  const r = size / 2;
  const holeR = r * holeRatio;

  let angle = 0;
  const paths = segments.map(seg => {
    const sweep = (seg.pct / 100) * 360;
    const d = sectorPath(cx, cy, r, angle, angle + sweep);
    angle += sweep;
    return { d, color: seg.color };
  });

  return (
    <View style={{ width: size, height: size }}>
      <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        {paths.map((p, i) => (
          <Path key={i} d={p.d} fill={p.color} stroke="white" strokeWidth={paths.length > 1 ? 2 : 0} />
        ))}
        <Circle cx={cx} cy={cy} r={holeR} fill="white" />
      </Svg>
      {(centerLabel || centerValue) && (
        <View style={[StyleSheet.absoluteFill, styles.center]}>
          {/* Constrain to the hole so the amount never spills onto the ring. */}
          <View style={{ width: holeR * 1.8, alignItems: 'center' }}>
            {centerLabel && <Text style={styles.label}>{centerLabel}</Text>}
            {centerValue && (
              <Text style={styles.value} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.5}>
                {centerValue}
              </Text>
            )}
            {centerSub && <Text style={styles.sub} numberOfLines={1}>{centerSub}</Text>}
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  center: { alignItems: 'center', justifyContent: 'center' },
  label: { fontSize: 11, fontFamily: F.semiBold, color: '#9595AB' },
  value: { fontSize: 20, fontFamily: F.extraBold, color: '#1B1B2A', letterSpacing: -0.5, marginTop: 1 },
  sub: { fontSize: 11, fontFamily: F.semiBold, color: '#B0B0C2', marginTop: 2 },
});
