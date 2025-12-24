import { useState, useCallback, useEffect, useRef } from 'react';
import { SimulationPhase, FrictionDataPoint } from '../types';

const GRAVITY = 9.8;
export const MAX_APPLIED_FORCE = 250;
const ANIMATION_SPEED_FACTOR = 0.001;
export const MAX_STRAIN_OFFSET = 30; // Max visual displacement during static strain

export const useFrictionSimulation = () => {
  const [muStatic, setMuStatic] = useState(0.6);
  const [muKinetic, setMuKinetic] = useState(0.4);
  const [mass, setMass] = useState(10);
  const [appliedForce, setAppliedForce] = useState(0);
  const [frictionForce, setFrictionForce] = useState(0);
  
  // `kineticPosition` is the permanent position from sliding.
  // `blockPosition` is the total visual position (kinetic + strain).
  const [kineticPosition, setKineticPosition] = useState(0);
  const [blockPosition, setBlockPosition] = useState(0);
  
  const [phase, setPhase] = useState<SimulationPhase>(SimulationPhase.STATIC_NO_FORCE);
  const [graphData, setGraphData] = useState<FrictionDataPoint[]>([{ applied: 0, friction: 0 }]);
  
  const animationFrameId = useRef<number | undefined>(undefined);
  const lastTimeRef = useRef<number | undefined>(undefined);
  const lastPhaseRef = useRef<SimulationPhase>(phase);
  
  const normalForce = mass * GRAVITY;
  const maxStaticFriction = muStatic * normalForce;
  const kineticFriction = muKinetic * normalForce;

  const resetSimulation = useCallback(() => {
    setAppliedForce(0);
    setFrictionForce(0);
    setKineticPosition(0);
    setBlockPosition(0);
    setPhase(SimulationPhase.STATIC_NO_FORCE);
    setGraphData([{ applied: 0, friction: 0 }]);
    lastPhaseRef.current = SimulationPhase.STATIC_NO_FORCE;
  }, []);

  const handleMassChange = (value: number) => {
    setMass(value);
    resetSimulation();
  };
  
  const handleMuStaticChange = (value: number) => {
    setMuStatic(value);
    if (muKinetic > value) {
      setMuKinetic(value);
    }
    resetSimulation();
  };

  const handleMuKineticChange = (value: number) => {
    if (value > muStatic) {
       setMuKinetic(muStatic);
    } else {
       setMuKinetic(value);
    }
    resetSimulation();
  };

  useEffect(() => {
    let newFrictionForce = 0;
    let newPhase: SimulationPhase;

    // Determine the new phase
    if (appliedForce < maxStaticFriction) {
      newPhase = appliedForce > 0 ? SimulationPhase.STATIC_APPLYING_FORCE : SimulationPhase.STATIC_NO_FORCE;
    } else {
      newPhase = SimulationPhase.KINETIC_MOTION;
    }

    // Determine friction force based on phase
    if (newPhase === SimulationPhase.KINETIC_MOTION) {
      newFrictionForce = kineticFriction;
    } else {
      newFrictionForce = appliedForce;
    }
    
    // Update visual block position for static phases
    if (newPhase !== SimulationPhase.KINETIC_MOTION) {
      const strainRatio = maxStaticFriction > 0 ? Math.min(appliedForce / maxStaticFriction, 1) : 0;
      setBlockPosition(kineticPosition + strainRatio * MAX_STRAIN_OFFSET);
    }

    setFrictionForce(newFrictionForce);
    setPhase(newPhase);

    // Update graph data
    setGraphData(prevData => {
      const lastPoint = prevData[prevData.length - 1];
      if (lastPoint.applied === appliedForce) {
        return prevData;
      }
       // If we just transitioned from static to kinetic, add the peak static friction point
      if (newPhase === SimulationPhase.KINETIC_MOTION && lastPhaseRef.current !== SimulationPhase.KINETIC_MOTION) {
          const peakData = { applied: maxStaticFriction, friction: maxStaticFriction };
          const kineticStartData = { applied: appliedForce, friction: kineticFriction };
          return [...prevData.filter(p => p.applied < maxStaticFriction), peakData, kineticStartData];
      }
      
      const newDataPoint = { applied: appliedForce, friction: newFrictionForce };
      return [...prevData, newDataPoint];
    });

    lastPhaseRef.current = newPhase;

  }, [appliedForce, maxStaticFriction, kineticFriction]);


  useEffect(() => {
    const animate = (timestamp: number) => {
      if (lastTimeRef.current !== undefined) {
        const deltaTime = timestamp - lastTimeRef.current;
        if (phase === SimulationPhase.KINETIC_MOTION) {
          const netForce = appliedForce - frictionForce;
          if (netForce > 0) {
            const deltaPosition = netForce * ANIMATION_SPEED_FACTOR * deltaTime;
            setKineticPosition(prev => prev + deltaPosition);
            setBlockPosition(prev => prev + deltaPosition);
          }
        }
      }
      lastTimeRef.current = timestamp;
      animationFrameId.current = requestAnimationFrame(animate);
    };

    animationFrameId.current = requestAnimationFrame(animate);

    return () => {
      if (animationFrameId.current) {
        cancelAnimationFrame(animationFrameId.current);
      }
      lastTimeRef.current = undefined;
    };
  }, [phase, appliedForce, frictionForce]);


  return {
    muStatic,
    muKinetic,
    mass,
    appliedForce,
    frictionForce,
    blockPosition,
    phase,
    graphData,
    maxStaticFriction,
    kineticFriction,
    handleMuStaticChange,
    handleMuKineticChange,
    handleMassChange,
    setAppliedForce,
    resetSimulation,
    MAX_APPLIED_FORCE,
  };
};