
export enum AtomType {
  TABLE = 0,
  BLOCK_BODY = 1,
  BLOCK_ASPERITY = 2,
  BLOCK_TIP = 3,
  BROKEN_TIP = 4
}

export interface SimulationParams {
  mass: number;
  muStatic: number;
  muKinetic: number;
  appliedForce: number;
}

export class PhysicsEngine {
  // Config
  private readonly ATOM_RADIUS = 7;
  private readonly ATOM_DIAMETER = 14;
  private readonly WIDTH = 800;
  private readonly HEIGHT = 400;
  private readonly ASPERITY_CX = 400;
  private readonly ASPERITY_WIDTH = 280;
  private readonly ASPERITY_HEIGHT = 120;

  // Physics State
  public blockPosition = 0;
  public velocity = 0;
  public frictionForce = 0;
  public isKinetic = false;
  public brokenTipPosition: number | null = null;
  public tipAtomIndices: number[] = [];

  // Particle Data (Structure of Arrays for performance)
  // [x, y]
  private tableAtoms: Float32Array; 
  // [relX, relY] (relative to block position)
  private blockAtoms: Float32Array; 
  private blockAtomTypes: Uint8Array; 
  
  private tableCount = 0;
  private blockCount = 0;

  constructor(initialMass: number) {
    // Determine size first (approximate max size to avoid realloc)
    // Table roughly 80*6 = 480 atoms
    // Block roughly 80*7 = 560 atoms
    this.tableAtoms = new Float32Array(2000); 
    this.blockAtoms = new Float32Array(2000);
    this.blockAtomTypes = new Uint8Array(1000);

    this.initAtoms(initialMass);
  }

  public initAtoms(mass: number) {
    // Reset counters
    this.tableCount = 0;
    this.blockCount = 0;
    this.tipAtomIndices = [];

    const MIN_MASS = 5;
    const MAX_MASS = 25;
    const massRatio = (mass - MIN_MASS) / (MAX_MASS - MIN_MASS);
    
    const tipWidth = 40 + (massRatio * 60); 
    const tipAtomCount = 2 + Math.floor(massRatio * 3);

    // Helper functions (same logic as before)
    const getAsperityEffect = (x: number) => {
      const halfWidth = this.ASPERITY_WIDTH / 2;
      if (x >= this.ASPERITY_CX - halfWidth && x <= this.ASPERITY_CX + halfWidth) {
        return (Math.cos((x - this.ASPERITY_CX) / halfWidth * Math.PI) + 1) / 2 * this.ASPERITY_HEIGHT;
      }
      return 0;
    };

    // --- Generate Table ---
    const tableSurface = (x: number) => 280 + getAsperityEffect(x);

    for (let y = 0; y < 6; y++) {
      for (let x = -5; x < this.WIDTH / this.ATOM_DIAMETER + 5; x++) {
        const cx = x * this.ATOM_DIAMETER * 0.9;
        const cy = tableSurface(cx) + y * this.ATOM_DIAMETER * 0.85;
        if (cy < this.HEIGHT + 50) {
            this.tableAtoms[this.tableCount * 2] = cx;
            this.tableAtoms[this.tableCount * 2 + 1] = cy;
            this.tableCount++;
        }
      }
    }

    // --- Generate Block ---
    const verticalGap = 20 - (massRatio * 16);
    const blockBaseY = 152 + (20 - verticalGap);
    const blockSurface = (x: number) => blockBaseY + getAsperityEffect(x);

    for (let y = 0; y < 7; y++) {
      for (let x = -5; x < this.WIDTH / this.ATOM_DIAMETER + 5; x++) {
        const cx = x * this.ATOM_DIAMETER * 0.9;
        const cy = blockSurface(cx) - y * this.ATOM_DIAMETER * 0.85;
        
        if (cy > 0) {
            let part = AtomType.BLOCK_BODY;
            const flatSurfaceYForLayer = blockBaseY - y * this.ATOM_DIAMETER * 0.85;
            
            if (cy > flatSurfaceYForLayer) {
                part = AtomType.BLOCK_ASPERITY;
                const halfTipWidth = tipWidth / 2;
                if (cx > this.ASPERITY_CX - halfTipWidth && cx < this.ASPERITY_CX + halfTipWidth && y < tipAtomCount) {
                    part = AtomType.BLOCK_TIP;
                }
            }

            this.blockAtoms[this.blockCount * 2] = cx; // Store relative X (but logic used absolute, will offset during draw)
            this.blockAtoms[this.blockCount * 2 + 1] = cy;
            this.blockAtomTypes[this.blockCount] = part;

            if (part === AtomType.BLOCK_TIP) {
                this.tipAtomIndices.push(this.blockCount);
            }

            this.blockCount++;
        }
      }
    }
  }

  public update(dt: number, params: SimulationParams) {
    const { mass, muStatic, muKinetic, appliedForce } = params;
    const GRAVITY = 9.8;
    const normalForce = mass * GRAVITY;
    const maxStaticFriction = muStatic * normalForce;
    const kineticFriction = muKinetic * normalForce;

    // Determine Phase & Friction
    let netForce = 0;
    
    if (this.isKinetic) {
        // Kinetic Phase
        this.frictionForce = kineticFriction;
        // If applied force drops, it might eventually stop (simplification: strict kinetic model)
        // For this sim, we assume once kinetic, it slides if force > friction, or slows down.
        // We follow original logic: pure F = ma
        netForce = appliedForce - this.frictionForce;
        
    } else {
        // Static Phase
        if (appliedForce >= maxStaticFriction) {
            this.isKinetic = true;
            this.brokenTipPosition = this.blockPosition; // Capture break point
            this.frictionForce = kineticFriction;
            netForce = appliedForce - this.frictionForce;
        } else {
            this.frictionForce = appliedForce;
            netForce = 0;
            
            // Visual strain (spring effect)
            const MAX_STRAIN = 30;
            const strainRatio = maxStaticFriction > 0 ? (appliedForce / maxStaticFriction) : 0;
            // The blockPosition here purely visual offset for strain
            // Ideally we separate "actual" pos from "visual" pos, but for simplicity:
            // logic in hook used: kineticPos + strain
            // Here we only track kinetic pos basically.
            // Let's adopt a simple model: blockPosition = kineticBase + elasticOffset
        }
    }

    // Motion Integration (Euler)
    if (this.isKinetic) {
        // F = ma -> a = F/m
        const acceleration = netForce / mass; 
        
        // Speed factor to make animation viewable
        const ANIMATION_SPEED = 500; // pixels per second squared approx
        
        // Simpler model from original code: velocity proportional to force? 
        // Original: deltaPosition = netForce * ANIMATION_SPEED_FACTOR * deltaTime
        // This effectively implies overdamped system (velocity ~ force).
        // Let's stick to original behavior for consistency.
        
        if (netForce > 0) {
           const dx = netForce * 0.001 * dt;
           this.blockPosition += dx;
        }
    } else {
       // Static Strain
       // Reset block position to pure elastic deformation
       // We need to know "where we stopped". 
       // For this simple refactor, we assume starting from 0.
       // TODO: Keep track of base position.
       const MAX_STRAIN = 30;
       const strain = maxStaticFriction > 0 ? (appliedForce / maxStaticFriction) * MAX_STRAIN : 0;
       // Note: this overrides accumulated position if we were sliding previously?
       // The original hook logic was: kineticPosition (accumulated) + strain.
       // We accept blockPosition as the total visual position.
       // So if !isKinetic, we don't accumulate, we just set offset.
       // However, if we come from Kinetic -> Static (reset), blockPos is 0.
    }
  }
  
  // Specific method to handle the hook's logic of "Kinetic Position" vs "Strain"
  public setPositions(kineticPos: number, strain: number) {
      this.blockPosition = kineticPos + strain;
  }

  public draw(ctx: CanvasRenderingContext2D, dpr: number) {
    // Clear
    ctx.fillStyle = '#f3f4f6';
    ctx.fillRect(0, 0, this.WIDTH, this.HEIGHT);

    // --- Draw Table (Batch Render) ---
    ctx.fillStyle = '#3b82f6';
    ctx.strokeStyle = '#2563eb';
    ctx.lineWidth = 0.5;
    
    ctx.beginPath();
    for (let i = 0; i < this.tableCount; i++) {
        const x = this.tableAtoms[i * 2];
        const y = this.tableAtoms[i * 2 + 1];
        // Move to start of arc to avoid connecting lines
        ctx.moveTo(x + this.ATOM_RADIUS, y);
        ctx.arc(x, y, this.ATOM_RADIUS, 0, Math.PI * 2);
    }
    ctx.fill();
    ctx.stroke();
    
    // Table Label
    ctx.font = "bold 24px 'Outfit', sans-serif";
    ctx.fillStyle = '#3b82f6';
    ctx.textAlign = "end";
    ctx.fillText("TABLE", 750, 380);

    // --- Draw Broken Tip (if exists) ---
    if (this.isKinetic && this.brokenTipPosition !== null) {
        ctx.fillStyle = '#10b981';
        ctx.strokeStyle = '#059669';
        
        ctx.save();
        ctx.translate(this.brokenTipPosition, 0);
        
        ctx.beginPath();
        for (let i = 0; i < this.tipAtomIndices.length; i++) {
            const idx = this.tipAtomIndices[i];
            const x = this.blockAtoms[idx * 2];
            const y = this.blockAtoms[idx * 2 + 1];
            
            ctx.moveTo(x + this.ATOM_RADIUS, y);
            ctx.arc(x, y, this.ATOM_RADIUS, 0, Math.PI * 2);
        }
        ctx.fill();
        ctx.stroke();
        ctx.restore();
    }

    // --- Draw Block (Batch Render) ---
    ctx.fillStyle = '#10b981';
    ctx.strokeStyle = '#059669';
    
    ctx.save();
    ctx.translate(this.blockPosition, 0);

    ctx.beginPath();
    for (let i = 0; i < this.blockCount; i++) {
        const type = this.blockAtomTypes[i];
        
        // Skip tip if broken
        if (this.isKinetic && type === AtomType.BLOCK_TIP) continue;
        
        const x = this.blockAtoms[i * 2];
        const y = this.blockAtoms[i * 2 + 1];
        
        ctx.moveTo(x + this.ATOM_RADIUS, y);
        ctx.arc(x, y, this.ATOM_RADIUS, 0, Math.PI * 2);
    }
    ctx.fill();
    ctx.stroke();

    // Block Label
    ctx.font = "bold 32px 'Outfit', sans-serif";
    ctx.fillStyle = '#10b981';
    ctx.textAlign = "center";
    ctx.fillText("BLOCK", this.WIDTH / 2, 80);

    // Friction Arrow (Attached to block)
    this.drawArrow(ctx, this.ASPERITY_CX, 220, -this.frictionForce, '#ef4444', "Friction Force");
    
    ctx.restore();
  }

  private drawArrow(ctx: CanvasRenderingContext2D, x: number, y: number, magnitude: number, color: string, label: string) {
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

       // Arrowhead logic...
       // (Simplified for brevity, assume similar to original)
       const headLen = 12;
       const direction = isLeft ? -1 : 1;
       ctx.beginPath();
       ctx.moveTo(endX, y);
       ctx.lineTo(endX - headLen * direction, y - 6);
       ctx.lineTo(endX - headLen * direction, y + 6);
       ctx.fillStyle = color;
       ctx.fill();
       
       // Text
       ctx.font = "bold 22px 'Outfit', sans-serif";
       ctx.fillStyle = color;
       ctx.textAlign = "center";
       ctx.textBaseline = "bottom";
       ctx.lineWidth = 4;
       ctx.strokeStyle = "white";
       const text = `${label} (${Math.abs(magnitude).toFixed(1)}N)`;
       ctx.strokeText(text, x + effectiveLength / 2, y - 10);
       ctx.fillText(text, x + effectiveLength / 2, y - 10);
  }
}
