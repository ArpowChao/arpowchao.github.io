import React from 'react';
import { SimulationPhase } from '../types';

interface ExplanationPanelProps {
  phase: SimulationPhase;
}

const phaseInfo = {
  [SimulationPhase.STATIC_NO_FORCE]: {
    title: "At Rest (No Applied Force)",
    description: "The object is stationary. At the microscopic level, asperities (bumps) on the surfaces interlock. Since there is no external force, the friction force is zero.",
    color: "bg-blue-100 border-blue-500",
  },
  [SimulationPhase.STATIC_APPLYING_FORCE]: {
    title: "Static Friction (Deformation)",
    description: "As you apply force, the interlocked asperities strain and deform. This creates an internal shear stress that generates an opposing static friction force, which exactly matches your applied force and prevents movement.",
    color: "bg-yellow-100 border-yellow-500",
  },
  [SimulationPhase.KINETIC_MOTION]: {
    title: "Kinetic Friction (Shearing & Sliding)",
    description: "You've overcome the shear strength of the asperity! The tip of the microscopic bump breaks off (shears). With the main obstacle gone, the block slides. Kinetic friction is the force needed to continuously break these microscopic welds as the surfaces move past each other.",
    color: "bg-green-100 border-green-500",
  },
};

export const ExplanationPanel: React.FC<ExplanationPanelProps> = ({ phase }) => {
  const currentPhaseInfo = phaseInfo[phase];
  
  return (
    <div className="flex flex-col h-full">
      <h2 className="text-2xl font-semibold mb-4 text-center">What's Happening?</h2>
      <div className={`p-4 rounded-lg border-l-4 transition-all duration-300 ${currentPhaseInfo.color}`}>
        <h3 className="font-bold text-lg mb-2 text-gray-800">{currentPhaseInfo.title}</h3>
        <p className="text-gray-700">{currentPhaseInfo.description}</p>
      </div>
    </div>
  );
};