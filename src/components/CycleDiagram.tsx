"use client";

import { useState } from "react";

const STEPS = [
  {
    title: "1. Predict Quaternions",
    desc: "The quaternion head predicts a rotation quaternion q(t) at each frame. These are averaged across points and normalized to get global frame rotations.",
    highlight: "predict",
  },
  {
    title: "2. Sample Anchor Triplet",
    desc: "Stratified sampling picks 3 frames: t_a from the first third, t_b from the middle, t_c from the last third of the sequence.",
    highlight: "anchors",
  },
  {
    title: "3. Forward Cycle",
    desc: "Compose predicted rotations: A\u2192B then B\u2192C to get predicted A\u2192C. Close the cycle with ground-truth C\u2192A. If predictions are correct, the composition equals identity.",
    highlight: "forward",
  },
  {
    title: "4. Backward Cycle",
    desc: "Same process in reverse: predicted C\u2192B then B\u2192A, closed with ground-truth A\u2192C. Both cycles should yield identity.",
    highlight: "backward",
  },
  {
    title: "5. Geodesic Error",
    desc: "Measure how far the cycle residual is from identity using geodesic distance on S\u00B3: d = 2\u00B7arccos(|<q_cycle, q_I>|). Handles q/-q double cover.",
    highlight: "error",
  },
  {
    title: "6. Confidence Weighting",
    desc: "Weight each cycle by SVD confidence: w = \u221A(conf_a \u00B7 conf_c). High-confidence frames contribute more to the loss.",
    highlight: "weight",
  },
];

export default function CycleDiagram() {
  const [step, setStep] = useState(0);
  const h = STEPS[step].highlight;

  return (
    <div className="flex flex-col gap-6 lg:flex-row lg:gap-10">
      {/* SVG Diagram */}
      <div className="flex-1 flex items-center justify-center">
        <svg
          viewBox="0 0 400 320"
          className="w-full max-w-md"
          xmlns="http://www.w3.org/2000/svg"
        >
          <defs>
            <marker
              id="arrow-pred"
              viewBox="0 0 10 10"
              refX="9"
              refY="5"
              markerWidth="6"
              markerHeight="6"
              orient="auto"
            >
              <path d="M 0 0 L 10 5 L 0 10 z" fill="#6366f1" />
            </marker>
            <marker
              id="arrow-gt"
              viewBox="0 0 10 10"
              refX="9"
              refY="5"
              markerWidth="6"
              markerHeight="6"
              orient="auto"
            >
              <path d="M 0 0 L 10 5 L 0 10 z" fill="#22c55e" />
            </marker>
            <marker
              id="arrow-bwd"
              viewBox="0 0 10 10"
              refX="9"
              refY="5"
              markerWidth="6"
              markerHeight="6"
              orient="auto"
            >
              <path d="M 0 0 L 10 5 L 0 10 z" fill="#f97316" />
            </marker>
          </defs>

          {/* Timeline */}
          <line
            x1="40"
            y1="280"
            x2="360"
            y2="280"
            stroke="#3f3f46"
            strokeWidth="2"
          />
          {Array.from({ length: 16 }).map((_, i) => (
            <line
              key={i}
              x1={40 + i * 20 + 10}
              y1="276"
              x2={40 + i * 20 + 10}
              y2="284"
              stroke="#52525b"
              strokeWidth="1"
            />
          ))}
          <text x="40" y="300" fill="#71717a" fontSize="10" fontFamily="monospace">
            t=0
          </text>
          <text x="340" y="300" fill="#71717a" fontSize="10" fontFamily="monospace">
            t=T
          </text>

          {/* Anchor nodes */}
          {(h === "anchors" ||
            h === "forward" ||
            h === "backward" ||
            h === "error" ||
            h === "weight") && (
            <>
              {/* Stratification zones */}
              <rect
                x="40"
                y="260"
                width="107"
                height="16"
                rx="2"
                fill="#6366f120"
                stroke="#6366f140"
                strokeWidth="1"
              />
              <rect
                x="147"
                y="260"
                width="106"
                height="16"
                rx="2"
                fill="#6366f120"
                stroke="#6366f140"
                strokeWidth="1"
              />
              <rect
                x="253"
                y="260"
                width="107"
                height="16"
                rx="2"
                fill="#6366f120"
                stroke="#6366f140"
                strokeWidth="1"
              />
            </>
          )}

          {/* Frame A */}
          <circle
            cx="90"
            cy="200"
            r={h === "predict" ? 20 : 24}
            fill={
              h === "anchors" ||
              h === "forward" ||
              h === "backward" ||
              h === "error" ||
              h === "weight"
                ? "#6366f1"
                : "#27272a"
            }
            stroke={h === "predict" ? "#6366f1" : "#3f3f46"}
            strokeWidth="2"
          />
          <text
            x="90"
            y="205"
            textAnchor="middle"
            fill="white"
            fontSize="14"
            fontWeight="bold"
          >
            A
          </text>
          <text
            x="90"
            y="240"
            textAnchor="middle"
            fill="#a1a1aa"
            fontSize="10"
            fontFamily="monospace"
          >
            t_a
          </text>

          {/* Frame B */}
          <circle
            cx="200"
            cy="100"
            r={h === "predict" ? 20 : 24}
            fill={
              h === "anchors" ||
              h === "forward" ||
              h === "backward"
                ? "#6366f1"
                : "#27272a"
            }
            stroke={h === "predict" ? "#6366f1" : "#3f3f46"}
            strokeWidth="2"
          />
          <text
            x="200"
            y="105"
            textAnchor="middle"
            fill="white"
            fontSize="14"
            fontWeight="bold"
          >
            B
          </text>
          <text
            x="200"
            y="80"
            textAnchor="middle"
            fill="#a1a1aa"
            fontSize="10"
            fontFamily="monospace"
          >
            t_b
          </text>

          {/* Frame C */}
          <circle
            cx="310"
            cy="200"
            r={h === "predict" ? 20 : 24}
            fill={
              h === "anchors" ||
              h === "forward" ||
              h === "backward" ||
              h === "error" ||
              h === "weight"
                ? "#6366f1"
                : "#27272a"
            }
            stroke={h === "predict" ? "#6366f1" : "#3f3f46"}
            strokeWidth="2"
          />
          <text
            x="310"
            y="205"
            textAnchor="middle"
            fill="white"
            fontSize="14"
            fontWeight="bold"
          >
            C
          </text>
          <text
            x="310"
            y="240"
            textAnchor="middle"
            fill="#a1a1aa"
            fontSize="10"
            fontFamily="monospace"
          >
            t_c
          </text>

          {/* Forward cycle arrows */}
          {(h === "forward" || h === "error" || h === "weight") && (
            <>
              {/* A→B predicted */}
              <path
                d="M 108 188 Q 140 140 180 108"
                fill="none"
                stroke="#6366f1"
                strokeWidth="2"
                markerEnd="url(#arrow-pred)"
              />
              <text x="120" y="145" fill="#6366f1" fontSize="9" fontFamily="monospace">
                pred A{"\u2192"}B
              </text>
              {/* B→C predicted */}
              <path
                d="M 220 108 Q 260 140 294 188"
                fill="none"
                stroke="#6366f1"
                strokeWidth="2"
                markerEnd="url(#arrow-pred)"
              />
              <text x="252" y="145" fill="#6366f1" fontSize="9" fontFamily="monospace">
                pred B{"\u2192"}C
              </text>
              {/* C→A ground truth */}
              <path
                d="M 286 208 Q 200 240 114 208"
                fill="none"
                stroke="#22c55e"
                strokeWidth="2"
                strokeDasharray="6 3"
                markerEnd="url(#arrow-gt)"
              />
              <text x="175" y="238" fill="#22c55e" fontSize="9" fontFamily="monospace">
                GT C{"\u2192"}A
              </text>
            </>
          )}

          {/* Backward cycle arrows */}
          {h === "backward" && (
            <>
              {/* C→B predicted */}
              <path
                d="M 294 188 Q 260 140 220 108"
                fill="none"
                stroke="#f97316"
                strokeWidth="2"
                markerEnd="url(#arrow-bwd)"
              />
              <text x="252" y="145" fill="#f97316" fontSize="9" fontFamily="monospace">
                pred C{"\u2192"}B
              </text>
              {/* B→A predicted */}
              <path
                d="M 180 108 Q 140 140 108 188"
                fill="none"
                stroke="#f97316"
                strokeWidth="2"
                markerEnd="url(#arrow-bwd)"
              />
              <text x="110" y="145" fill="#f97316" fontSize="9" fontFamily="monospace">
                pred B{"\u2192"}A
              </text>
              {/* A→C ground truth */}
              <path
                d="M 114 208 Q 200 240 286 208"
                fill="none"
                stroke="#22c55e"
                strokeWidth="2"
                strokeDasharray="6 3"
                markerEnd="url(#arrow-gt)"
              />
              <text x="175" y="238" fill="#22c55e" fontSize="9" fontFamily="monospace">
                GT A{"\u2192"}C
              </text>
            </>
          )}

          {/* Error / Identity indicator */}
          {(h === "error" || h === "weight") && (
            <>
              <text
                x="200"
                y="168"
                textAnchor="middle"
                fill="#fbbf24"
                fontSize="11"
                fontFamily="monospace"
              >
                cycle {"\u2248"} identity?
              </text>
              <text
                x="200"
                y="185"
                textAnchor="middle"
                fill="#fbbf24"
                fontSize="10"
                fontFamily="monospace"
              >
                {"\u03B5"} = d(q_cycle, q_I)
              </text>
            </>
          )}

          {/* Confidence badges */}
          {h === "weight" && (
            <>
              <rect
                x="60"
                y="175"
                width="16"
                height="16"
                rx="3"
                fill="#22c55e40"
                stroke="#22c55e"
                strokeWidth="1"
              />
              <text x="68" y="186" textAnchor="middle" fill="#22c55e" fontSize="8">
                w
              </text>
              <rect
                x="324"
                y="175"
                width="16"
                height="16"
                rx="3"
                fill="#22c55e40"
                stroke="#22c55e"
                strokeWidth="1"
              />
              <text x="332" y="186" textAnchor="middle" fill="#22c55e" fontSize="8">
                w
              </text>
            </>
          )}

          {/* Quaternion head indicator */}
          {h === "predict" && (
            <>
              {[90, 200, 310].map((cx) => (
                <g key={cx}>
                  {Array.from({ length: 6 }).map((_, j) => (
                    <circle
                      key={j}
                      cx={cx + (Math.random() - 0.5) * 28}
                      cy={
                        (cx === 200 ? 100 : 200) + (Math.random() - 0.5) * 28
                      }
                      r="2"
                      fill="#6366f180"
                    />
                  ))}
                </g>
              ))}
              <text
                x="200"
                y="40"
                textAnchor="middle"
                fill="#6366f1"
                fontSize="11"
                fontFamily="monospace"
              >
                quat_head {"\u2192"} q(t) per frame
              </text>
            </>
          )}
        </svg>
      </div>

      {/* Step controls */}
      <div className="flex flex-col gap-3 lg:w-80">
        {STEPS.map((s, i) => (
          <button
            key={i}
            onClick={() => setStep(i)}
            className={`rounded-lg border p-3 text-left transition-all ${
              i === step
                ? "border-[var(--accent)] bg-[#6366f115]"
                : "border-[var(--card-border)] bg-[var(--card)] hover:border-[#3f3f46]"
            }`}
          >
            <div
              className={`text-sm font-medium ${
                i === step ? "text-[var(--accent)]" : "text-[var(--foreground)]"
              }`}
            >
              {s.title}
            </div>
            {i === step && (
              <div className="mt-1 text-xs leading-relaxed text-[var(--muted)]">
                {s.desc}
              </div>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}
