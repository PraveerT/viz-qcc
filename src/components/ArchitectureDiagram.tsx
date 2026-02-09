"use client";

export default function ArchitectureDiagram() {
  return (
    <svg
      viewBox="0 0 600 400"
      className="w-full max-w-2xl mx-auto"
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <marker
          id="arr"
          viewBox="0 0 10 10"
          refX="9"
          refY="5"
          markerWidth="5"
          markerHeight="5"
          orient="auto"
        >
          <path d="M 0 0 L 10 5 L 0 10 z" fill="#52525b" />
        </marker>
        <marker
          id="arr-accent"
          viewBox="0 0 10 10"
          refX="9"
          refY="5"
          markerWidth="5"
          markerHeight="5"
          orient="auto"
        >
          <path d="M 0 0 L 10 5 L 0 10 z" fill="#6366f1" />
        </marker>
        <marker
          id="arr-green"
          viewBox="0 0 10 10"
          refX="9"
          refY="5"
          markerWidth="5"
          markerHeight="5"
          orient="auto"
        >
          <path d="M 0 0 L 10 5 L 0 10 z" fill="#22c55e" />
        </marker>
        <marker
          id="arr-red"
          viewBox="0 0 10 10"
          refX="9"
          refY="5"
          markerWidth="5"
          markerHeight="5"
          orient="auto"
        >
          <path d="M 0 0 L 10 5 L 0 10 z" fill="#ef4444" />
        </marker>
      </defs>

      {/* Input */}
      <rect x="20" y="170" width="80" height="40" rx="6" fill="#27272a" stroke="#3f3f46" strokeWidth="1" />
      <text x="60" y="194" textAnchor="middle" fill="#a1a1aa" fontSize="11" fontFamily="monospace">Points</text>
      <text x="60" y="225" textAnchor="middle" fill="#52525b" fontSize="9" fontFamily="monospace">(B,3,T,N)</text>

      {/* Arrow: Input → Backbone */}
      <line x1="100" y1="190" x2="140" y2="190" stroke="#52525b" strokeWidth="1.5" markerEnd="url(#arr)" />

      {/* Backbone */}
      <rect x="145" y="160" width="100" height="60" rx="6" fill="#1e1b2e" stroke="#6366f140" strokeWidth="1" />
      <text x="195" y="186" textAnchor="middle" fill="#c4b5fd" fontSize="11" fontWeight="500">Backbone</text>
      <text x="195" y="200" textAnchor="middle" fill="#71717a" fontSize="9" fontFamily="monospace">Stages 1-3 + Mamba</text>

      {/* Split: Backbone → Quat Head + Classifier */}
      <line x1="245" y1="175" x2="290" y2="80" stroke="#6366f1" strokeWidth="1.5" markerEnd="url(#arr-accent)" />
      <line x1="245" y1="200" x2="330" y2="200" stroke="#52525b" strokeWidth="1.5" markerEnd="url(#arr)" />

      {/* Quaternion Head */}
      <rect x="295" y="50" width="110" height="55" rx="6" fill="#1e1b2e" stroke="#6366f1" strokeWidth="1.5" />
      <text x="350" y="72" textAnchor="middle" fill="#6366f1" fontSize="11" fontWeight="500">Quat Head</text>
      <text x="350" y="88" textAnchor="middle" fill="#71717a" fontSize="9" fontFamily="monospace">ExpMap → q(t)</text>
      <text x="350" y="100" textAnchor="middle" fill="#52525b" fontSize="8" fontFamily="monospace">(B,4,T,N)</text>

      {/* Quat Head → Angular Vel */}
      <line x1="350" y1="105" x2="350" y2="135" stroke="#6366f1" strokeWidth="1.5" markerEnd="url(#arr-accent)" />

      {/* Angular Velocity box */}
      <rect x="305" y="137" width="90" height="32" rx="6" fill="#0f172a" stroke="#6366f180" strokeWidth="1" />
      <text x="350" y="152" textAnchor="middle" fill="#67e8f9" fontSize="9" fontFamily="monospace">angular_vel</text>
      <text x="350" y="163" textAnchor="middle" fill="#52525b" fontSize="8" fontFamily="monospace">atan2(‖xyz‖,|w|)</text>

      {/* Angular Vel → Vel Projection */}
      <line x1="350" y1="169" x2="350" y2="185" stroke="#52525b" strokeWidth="1.5" markerEnd="url(#arr)" />

      {/* Vel Projection */}
      <rect x="335" y="187" width="85" height="26" rx="4" fill="#27272a" stroke="#3f3f46" strokeWidth="1" />
      <text x="378" y="204" textAnchor="middle" fill="#a1a1aa" fontSize="9" fontFamily="monospace">Conv1d(1,4)</text>

      {/* Cat + Classifier */}
      <rect x="335" y="230" width="130" height="40" rx="6" fill="#27272a" stroke="#3f3f46" strokeWidth="1" />
      <text x="400" y="247" textAnchor="middle" fill="#a1a1aa" fontSize="9" fontFamily="monospace">cat → Stage5</text>
      <text x="400" y="260" textAnchor="middle" fill="#52525b" fontSize="8" fontFamily="monospace">4+256+4 = 264ch</text>

      {/* Backbone features → cat */}
      <path d="M 295 210 L 295 245 L 335 245" fill="none" stroke="#52525b" strokeWidth="1.5" markerEnd="url(#arr)" />
      {/* Vel projection → cat */}
      <line x1="378" y1="213" x2="378" y2="230" stroke="#52525b" strokeWidth="1.5" markerEnd="url(#arr)" />

      {/* Classifier → Output */}
      <line x1="400" y1="270" x2="400" y2="300" stroke="#52525b" strokeWidth="1.5" markerEnd="url(#arr)" />

      {/* Output */}
      <rect x="365" y="302" width="70" height="30" rx="6" fill="#27272a" stroke="#3f3f46" strokeWidth="1" />
      <text x="400" y="321" textAnchor="middle" fill="#fafafa" fontSize="11" fontWeight="500">Logits</text>

      {/* QCC Loss branch */}
      <line x1="405" y1="78" x2="500" y2="78" stroke="#22c55e" strokeWidth="1.5" strokeDasharray="4 3" markerEnd="url(#arr-green)" />

      {/* QCC Loss box */}
      <rect x="505" y="55" width="80" height="45" rx="6" fill="#052e16" stroke="#22c55e" strokeWidth="1.5" />
      <text x="545" y="75" textAnchor="middle" fill="#22c55e" fontSize="11" fontWeight="500">QCC v3</text>
      <text x="545" y="90" textAnchor="middle" fill="#4ade80" fontSize="8" fontFamily="monospace">cycle loss</text>

      {/* CE Loss */}
      <line x1="400" y1="332" x2="400" y2="360" stroke="#ef4444" strokeWidth="1.5" markerEnd="url(#arr-red)" />
      <rect x="365" y="362" width="70" height="26" rx="6" fill="#450a0a" stroke="#ef4444" strokeWidth="1.5" />
      <text x="400" y="379" textAnchor="middle" fill="#ef4444" fontSize="10" fontWeight="500">CE Loss</text>

      {/* Gradient flow labels */}
      <text x="530" y="130" textAnchor="middle" fill="#22c55e" fontSize="8" fontFamily="monospace">
        QCC grads →
      </text>
      <text x="530" y="142" textAnchor="middle" fill="#22c55e" fontSize="8" fontFamily="monospace">
        quat_head + backbone
      </text>

      <text x="490" y="358" textAnchor="middle" fill="#ef4444" fontSize="8" fontFamily="monospace">
        CE grads →
      </text>
      <text x="490" y="370" textAnchor="middle" fill="#ef4444" fontSize="8" fontFamily="monospace">
        backbone + vel_proj
      </text>
      <text x="490" y="382" textAnchor="middle" fill="#71717a" fontSize="8" fontFamily="monospace">
        (NOT quat_head)
      </text>
    </svg>
  );
}
