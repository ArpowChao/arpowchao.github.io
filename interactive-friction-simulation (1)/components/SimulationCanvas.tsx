import React, { useMemo, useRef, useEffect } from 'react';
import { SimulationPhase } from '../types';

const ATOM_RADIUS = 7;
const ATOM_DIAMETER = ATOM_RADIUS * 2;
const VIEWBOX_WIDTH = 800;
const VIEWBOX_HEIGHT = 400;

// Config for asperity shape
const ASPERITY_CONFIG = {
  cx: VIEWBOX_WIDTH / 2,
  width: 280, 
  height: 120,
};

const MIN_MASS = 5;
const MAX_MASS = 25;

// Pre-calculate atom positions based on mass
const generateAtoms = (mass: number) => {
  const tableAtoms: { id: string; cx: number; cy: number }[] = [];
  const blockAtoms: { id: string; cx: number; cy: number; part: string }[] = [];
  
  const massRatio = (mass - MIN_MASS) / (MAX_MASS - MIN_MASS);
  
  // More mass = larger tip that breaks off (stronger weld)
  const tipWidth = 40 + (massRatio * 60); 
  const tipAtomCount = 2 + Math.floor(massRatio * 3);

  const getAsperityEffect = (x: number) => {
    const halfWidth = ASPERITY_CONFIG.width / 2;
    if (x >= ASPERITY_CONFIG.cx - halfWidth && x <= ASPERITY_CONFIG.cx + halfWidth) {
      return (Math.cos((x - ASPERITY_CONFIG.cx) / halfWidth * Math.PI) + 1) / 2 * ASPERITY_CONFIG.height;
    }
    return 0;
  };

  // --- Generate Table (Blue) Atoms ---
  const tableSurface = (x: number) => {
    const baseY = 280;
    return baseY + getAsperityEffect(x);
  };

  for (let y = 0; y < 6; y++) {
    for (let x = -5; x < VIEWBOX_WIDTH / ATOM_DIAMETER + 5; x++) {
      const cx = x * ATOM_DIAMETER * 0.9;
      const cy = tableSurface(cx) + y * ATOM_DIAMETER * 0.85;
      if (cy < VIEWBOX_HEIGHT + 50) {
        tableAtoms.push({ id: `t-${x}-${y}`, cx, cy });
      }
    }
  }
  
  // Higher mass pushes the block down. Increased range for more obvious effect.
  const verticalGap = 20 - (massRatio * 16);
  const blockBaseY = 152 + (20 - verticalGap);
  
  const blockSurface = (x: number) => {
    return blockBaseY + getAsperityEffect(x);
  };

  for (let y = 0; y < 7; y++) {
    for (let x = -5; x < VIEWBOX_WIDTH / ATOM_DIAMETER + 5; x++) {
      const cx = x * ATOM_DIAMETER * 0.9;
      const cy = blockSurface(cx) - y * ATOM_DIAMETER * 0.85;
      if (cy > 0) {
        let part = 'body';
        const flatSurfaceYForLayer = blockBaseY - y * ATOM_DIAMETER * 0.85;
        const isPartOfBump = cy > flatSurfaceYForLayer;

        if (isPartOfBump) {
          part = 'asperity';
          const halfTipWidth = tipWidth / 2;
          if (cx > ASPERITY_CONFIG.cx - halfTipWidth && cx < ASPERITY_CONFIG.cx + halfTipWidth && y < tipAtomCount) {
            part = 'tip';
          }
        }
        blockAtoms.push({ id: `b-${x}-${y}`, cx, cy, part });
      }
    }
  }

  return { tableAtoms, blockAtoms };
};

interface SimulationCanvasProps {
  phase: SimulationPhase;
  blockPosition: number;
  appliedForce: number;
  frictionForce: number;
  mass: number;
}

export const SimulationCanvas: React.FC<SimulationCanvasProps> = ({
  phase,
  blockPosition,
  appliedForce,
  frictionForce,
  mass,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { tableAtoms, blockAtoms } = useMemo(() => generateAtoms(mass), [mass]);

  // Ref to store the position where the tip breaks off
  const brokenTipPositionRef = useRef<number | null>(null);

  useEffect(() => {
    // If we just entered the kinetic phase, capture the position where the tip broke.
    if (phase === SimulationPhase.KINETIC_MOTION && brokenTipPositionRef.current === null) {
      brokenTipPositionRef.current = blockPosition;
    }
    // If the simulation is reset (not in kinetic motion), clear the broken tip position.
    if (phase !== SimulationPhase.KINETIC_MOTION) {
      brokenTipPositionRef.current = null;
    }
  }, [phase, blockPosition]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d', { alpha: false }); // Disable alpha for perf
    if (!ctx) return;

    // High DPI scaling
    const dpr = window.devicePixelRatio || 1;
    // Set actual size in memory (scaled to account for extra pixel density)
    canvas.width = VIEWBOX_WIDTH * dpr;
    canvas.height = VIEWBOX_HEIGHT * dpr;
    // Normalize coordinate system to use css pixels
    ctx.scale(dpr, dpr);

    const drawAtom = (x: number, y: number, color: string, stroke: string) => {
      ctx.beginPath();
      ctx.arc(x, y, ATOM_RADIUS, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.fill();
      ctx.lineWidth = 0.5;
      ctx.strokeStyle = stroke;
      ctx.stroke();
    };

    const drawArrow = (x: number, y: number, magnitude: number, color: string, label: string) => {
       if (Math.abs(magnitude) <= 0.1) return;
       
       const arrowLength = Math.max(20, Math.min(Math.abs(magnitude) * 1.5, 250));
       const isLeft = magnitude < 0;
       const effectiveLength = isLeft ? -arrowLength : arrowLength;
       const endX = x + effectiveLength;

       // Line
       ctx.beginPath();
       ctx.moveTo(isLeft ? x + 10 : x - 10, y);
       ctx.lineTo(endX, y);
       ctx.strokeStyle = color;
       ctx.lineWidth = 6;
       ctx.lineCap = 'round';
       ctx.stroke();

       // Arrowhead
       const headLen = 12;
       const angle = Math.atan2(0, effectiveLength);
       ctx.beginPath();
       // Head calculation is simpler since y is constant 0 for the line vector
       // But we need to point it correctly
       const pointX = endX;
       const pointY = y;
       
       // Correct arrow direction
       const direction = isLeft ? -1 : 1;

       ctx.moveTo(pointX, pointY);
       ctx.lineTo(pointX - headLen * direction, pointY - 6);
       ctx.lineTo(pointX - headLen * direction, pointY + 6);
       ctx.fillStyle = color;
       ctx.fill();

       // Text
       ctx.font = "bold 22px 'Outfit', sans-serif";
       ctx.fillStyle = color;
       ctx.textAlign = "center";
       ctx.textBaseline = "bottom";
       
       // Stroke text for readability
       ctx.lineWidth = 4;
       ctx.strokeStyle = "white";
       ctx.lineJoin = "round";
       
       const textX = x + effectiveLength / 2;
       const textY = y - 10;
       const text = `${label} (${Math.abs(magnitude).toFixed(1)}N)`;
       
       ctx.strokeText(text, textX, textY);
       ctx.fillText(text, textX, textY);
    };

    // --- Render Frame ---
    // Clear
    ctx.fillStyle = '#f3f4f6'; // bg-gray-100
    ctx.fillRect(0, 0, VIEWBOX_WIDTH, VIEWBOX_HEIGHT);

    // 1. Draw Table (Static) - Blue
    const tableFill = '#3b82f6';
    const tableStroke = '#2563eb';
    tableAtoms.forEach(atom => drawAtom(atom.cx, atom.cy, tableFill, tableStroke));
    
    // Table Label
    ctx.font = "bold 24px 'Outfit', sans-serif";
    ctx.fillStyle = tableFill;
    ctx.textAlign = "end";
    ctx.fillText("TABLE", 750, 380);

    // 2. Data Preparation for Block
    const isBroken = phase === SimulationPhase.KINETIC_MOTION;
    
    // Broken Tip Rendering (Fixed Position)
    if (isBroken && brokenTipPositionRef.current !== null) {
        const tipFill = '#10b981';
        const tipStroke = '#059669';
        const tipAtoms = blockAtoms.filter(a => a.part === 'tip');
        
        ctx.save();
        ctx.translate(brokenTipPositionRef.current, 0);
        tipAtoms.forEach(atom => drawAtom(atom.cx, atom.cy, tipFill, tipStroke));
        ctx.restore();
    }

    // Main Block Rendering (Moving)
    const bodyFill = '#10b981';
    const bodyStroke = '#059669';
    
    ctx.save();
    ctx.translate(blockPosition, 0);
    
    blockAtoms.forEach(atom => {
        // Skip tip if it is broken (as it's rendered separately above)
        if (isBroken && atom.part === 'tip') return;

        drawAtom(atom.cx, atom.cy, bodyFill, bodyStroke);
    });

    // Block Label
    ctx.font = "bold 32px 'Outfit', sans-serif";
    ctx.fillStyle = bodyFill;
    ctx.textAlign = "center";
    ctx.fillText("BLOCK", VIEWBOX_WIDTH / 2, 80);

    // Friction Force Arrow (Moves with block)
    drawArrow(ASPERITY_CONFIG.cx, 220, -frictionForce, '#ef4444', "Friction Force");
    
    ctx.restore();

    // 3. Applied Force Arrow (Stationary)
    drawArrow(450, 50, appliedForce, '#16a34a', "Applied Force");

  }, [tableAtoms, blockAtoms, blockPosition, appliedForce, frictionForce, phase]);

  return (
    <div className="w-full aspect-video bg-gray-100 rounded-lg overflow-hidden border-2 border-gray-300 relative">
      <canvas 
        ref={canvasRef}
        style={{ width: '100%', height: '100%', display: 'block' }}
      />
      <div className="absolute top-2 left-2 bg-white/70 backdrop-blur-sm p-2 rounded-lg text-sm text-gray-700 shadow pointer-events-none">
          Microscopic Asperity Interaction (Canvas Optimized)
      </div>
    </div>
  );
};