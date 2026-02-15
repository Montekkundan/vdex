"use client";

import React, { useEffect, useState } from "react";

const W = 68;
const H = 34;

const faceSymbol = ["@", "#", "$", "*"];

const faceColor = ["#e53935", "#43a047", "#fbc02d", "#1e88e5"];

const SCALE = 2;
const DESIRED_DIST = 4.5;

const V: [number, number, number][] = [
  [0.0, SCALE, 0.0],
  [-SCALE, -SCALE, -SCALE],
  [SCALE, -SCALE, -SCALE],
  [SCALE, -SCALE, SCALE],
  [-SCALE, -SCALE, SCALE],
];

const F: [number, number, number][] = [
  [0, 1, 2],
  [0, 2, 3],
  [0, 3, 4],
  [0, 4, 1],
];

const DU = 0.01;
const DV = 0.01;

const EDGE_LIST: [number, number][] = [
  [0, 1],
  [0, 2],
  [0, 3],
  [0, 4],
  [1, 2],
  [2, 3],
  [3, 4],
  [4, 1],
];

const sub3 = (a: number[], b: number[]): number[] => [
  a[0] - b[0],
  a[1] - b[1],
  a[2] - b[2],
];

const cross3 = (a: number[], b: number[]): number[] => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];

const norm3 = (v: number[]): number[] => {
  const r = Math.sqrt(v[0] * v[0] + v[1] * v[1] + v[2] * v[2]);
  return [v[0] / r, v[1] / r, v[2] / r];
};

export default function PyramidAnimation({
  wireframe = false,
  color = true,
  speed = 0.03,
  axis = "y",
  edges = true,
}: {
  wireframe?: boolean;
  color?: boolean;
  speed?: number;
  axis?: "x" | "y" | "z";
  edges?: boolean;
}) {
  const [frame, setFrame] = useState<React.ReactElement[]>([]);

  useEffect(() => {
    let currentTheta = 0;

    const renderFrame = (currentTheta: number) => {
      const faceBuf: number[] = Array(W * H).fill(-1);
      const lumBuf: number[] = Array(W * H).fill(0);
      const zBuf: number[] = Array(W * H).fill(0);

      const centroidModel = [0, 0, 0];
      for (let i = 0; i < 5; ++i) {
        centroidModel[0] += V[i][0];
        centroidModel[1] += V[i][1];
        centroidModel[2] += V[i][2];
      }
      centroidModel[0] *= 0.2;
      centroidModel[1] *= 0.2;
      centroidModel[2] *= 0.2;

      const fnorm: number[][] = [];
      for (let f = 0; f < 4; f++) {
        const e1 = sub3(V[F[f][1]], V[F[f][0]]);
        const e2 = sub3(V[F[f][2]], V[F[f][0]]);
        fnorm.push(norm3(cross3(e1, e2)));
      }

      const light = norm3([0.0, 1.0, -1.0]);

      let c = 1;
      let s = 0;
      if (axis === "y" || axis === "x" || axis === "z") {
        c = Math.cos(currentTheta);
        s = Math.sin(currentTheta);
      }

      const cz = -centroidModel[0] * s + centroidModel[2] * c;
      const offset = DESIRED_DIST - cz;

      const X_SCALE = 28.0;
      const Y_SCALE = 18.0;
      const Y_OFFSET = -4;

      if (!wireframe) {
        for (let f = 0; f < 4; f++) {
          for (let u = 0; u <= 1.0; u += DU) {
            for (let v = 0; u + v <= 1.0; v += DV) {
              const w = 1.0 - u - v;
              const x =
                w * V[F[f][0]][0] + u * V[F[f][1]][0] + v * V[F[f][2]][0];
              const y =
                w * V[F[f][0]][1] + u * V[F[f][1]][1] + v * V[F[f][2]][1];
              const z =
                w * V[F[f][0]][2] + u * V[F[f][1]][2] + v * V[F[f][2]][2];

              let x2 = x;
              let y2 = y;
              let z2 = z;
              if (axis === "y") {
                x2 = x * c + z * s;
                z2 = -x * s + z * c;
              } else if (axis === "x") {
                y2 = y * c - z * s;
                z2 = y * s + z * c;
              } else if (axis === "z") {
                x2 = x * c - y * s;
                y2 = x * s + y * c;
              }

              const z2Translated = z2 + offset;
              if (z2Translated <= 0) continue;
              const invz = 1.0 / z2Translated;

              const px = Math.floor(W / 2 + X_SCALE * x2 * invz);
              const py = Math.floor(H / 2 - Y_SCALE * y2 * invz + Y_OFFSET);
              if (px < 0 || px >= W || py < 0 || py >= H) continue;
              const idx = px + py * W;

              if (invz <= zBuf[idx]) continue;
              zBuf[idx] = invz;

              let nx = fnorm[f][0];
              let ny = fnorm[f][1];
              let nz = fnorm[f][2];
              if (axis === "y") {
                nx = fnorm[f][0] * c + fnorm[f][2] * s;
                nz = -fnorm[f][0] * s + fnorm[f][2] * c;
              } else if (axis === "x") {
                ny = fnorm[f][1] * c - fnorm[f][2] * s;
                nz = fnorm[f][1] * s + fnorm[f][2] * c;
              } else if (axis === "z") {
                nx = fnorm[f][0] * c - fnorm[f][1] * s;
                ny = fnorm[f][0] * s + fnorm[f][1] * c;
              }

              let L = nx * light[0] + ny * light[1] + nz * light[2];
              if (L < 0) L = 0;
              lumBuf[idx] = L;
              faceBuf[idx] = f;
            }
          }
        }
      }

      if (edges) {
        for (const [a, b] of EDGE_LIST) {
          const [x0, y0, z0] = V[a];
          const [x1, y1, z1] = V[b];
          for (let t = 0; t <= 1.0; t += 0.002) {
            const x = x0 + (x1 - x0) * t;
            const y = y0 + (y1 - y0) * t;
            const z = z0 + (z1 - z0) * t;

            let x2 = x;
            let y2 = y;
            let z2 = z;
            if (axis === "y") {
              x2 = x * c + z * s;
              z2 = -x * s + z * c;
            } else if (axis === "x") {
              y2 = y * c - z * s;
              z2 = y * s + z * c;
            } else if (axis === "z") {
              x2 = x * c - y * s;
              y2 = x * s + y * c;
            }

            const z2Translated = z2 + offset;
            if (z2Translated <= 0) continue;
            const invz = 1.0 / z2Translated;
            const px = Math.floor(W / 2 + X_SCALE * x2 * invz);
            const py = Math.floor(H / 2 - Y_SCALE * y2 * invz + Y_OFFSET);
            if (px < 0 || px >= W || py < 0 || py >= H) continue;
            const idx = px + py * W;

            if (invz > zBuf[idx]) {
              zBuf[idx] = invz + 1e-6;
              faceBuf[idx] = -2;
            }
          }
        }
      }

      const frameLines: React.ReactElement[] = [];
      for (let y = 0; y < H; y++) {
        const line: React.ReactElement[] = [];
        for (let x = 0; x < W; x++) {
          const i = x + y * W;
          const f = faceBuf[i];
          if (f === -2) {
            line.push(<span key={x} style={{ fontWeight: "bold" }}>+</span>);
          } else if (f < 0) {
            line.push(<span key={x}> </span>);
          } else {
            const L = lumBuf[i];
            const colorVal = color ? faceColor[f] : "currentColor";
            const fontWeight = L > 0.6 ? "bold" : "normal";
            line.push(
              <span key={x} style={{ color: colorVal, fontWeight }}>
                {faceSymbol[f]}
              </span>,
            );
          }
        }
        frameLines.push(<div key={y}>{line}</div>);
      }
      setFrame(frameLines);
    };

    const interval = setInterval(() => {
      currentTheta += speed;
      renderFrame(currentTheta);
    }, 30);

    renderFrame(currentTheta);
    return () => clearInterval(interval);
  }, [wireframe, color, speed, axis, edges]);

  return (
    <pre className="m-0 max-w-full overflow-hidden font-mono text-[10px] leading-[0.8] whitespace-pre text-center text-foreground">
      {frame}
    </pre>
  );
}
