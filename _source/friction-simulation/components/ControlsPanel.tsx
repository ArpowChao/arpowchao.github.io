
import React from 'react';
import { RefreshCw } from './icons';

interface ControlsPanelProps {
  muStatic: number;
  muKinetic: number;
  mass: number;
  appliedForce: number;
  handleMuStaticChange: (value: number) => void;
  handleMuKineticChange: (value: number) => void;
  handleMassChange: (value: number) => void;
  setAppliedForce: (value: number) => void;
  resetSimulation: () => void;
  MAX_APPLIED_FORCE: number;
}

const Slider = ({ label, value, min, max, step, onChange, unit }: { label: string, value: number, min: number, max: number, step: number, onChange: (e: React.ChangeEvent<HTMLInputElement>) => void, unit?: string }) => (
  <div className="flex flex-col space-y-2">
    <div className="flex justify-between items-center">
      <label className="font-medium text-gray-700">{label}</label>
      <span className="text-brand-primary font-semibold bg-blue-100 px-2 py-1 rounded-md">
        {value.toFixed(unit === 'kg' ? 1 : 2)} {unit}
      </span>
    </div>
    <input
      type="range"
      min={min}
      max={max}
      step={step}
      value={value}
      onChange={onChange}
      className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-brand-primary"
    />
  </div>
);

export const ControlsPanel: React.FC<ControlsPanelProps> = ({
  muStatic,
  muKinetic,
  mass,
  appliedForce,
  handleMuStaticChange,
  handleMuKineticChange,
  handleMassChange,
  setAppliedForce,
  resetSimulation,
  MAX_APPLIED_FORCE,
}) => {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Slider
          label="Static Friction (μs)"
          value={muStatic}
          min={0.1}
          max={1.0}
          step={0.01}
          onChange={(e) => handleMuStaticChange(parseFloat(e.target.value))}
        />
        <Slider
          label="Kinetic Friction (μk)"
          value={muKinetic}
          min={0.1}
          max={1.0}
          step={0.01}
          onChange={(e) => handleMuKineticChange(parseFloat(e.target.value))}
        />
        <Slider
          label="Mass"
          value={mass}
          min={5}
          max={25}
          step={0.5}
          onChange={(e) => handleMassChange(parseFloat(e.target.value))}
          unit="kg"
        />
      </div>
      <Slider
        label="Applied Force"
        value={appliedForce}
        min={0}
        max={MAX_APPLIED_FORCE}
        step={0.5}
        onChange={(e) => setAppliedForce(parseFloat(e.target.value))}
        unit="N"
      />
      <div className="pt-2 flex justify-center">
        <button
          onClick={resetSimulation}
          className="flex items-center justify-center gap-2 px-6 py-3 bg-accent-red text-white font-semibold rounded-lg shadow-md hover:bg-red-700 transition-all duration-300 transform hover:scale-105 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-opacity-50"
        >
          <RefreshCw />
          Reset Simulation
        </button>
      </div>
    </div>
  );
};