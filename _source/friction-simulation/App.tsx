import React from 'react';
import { ControlsPanel } from './components/ControlsPanel';
import { ExplanationPanel } from './components/ExplanationPanel';
import { FrictionGraph } from './components/FrictionGraph';
import { SimulationCanvas } from './components/SimulationCanvas';
import { useFrictionSimulation } from './hooks/useFrictionSimulation';

function App() {
  const simulation = useFrictionSimulation();

  return (
    <div className="min-h-screen bg-gray-50 text-brand-dark font-sans p-4 sm:p-6 lg:p-8">
      <div className="max-w-7xl mx-auto">
        <header className="text-center mb-8">
          <h1 className="text-4xl md:text-5xl font-bold text-brand-primary mb-2">
            Interactive Friction Simulation
          </h1>
          <p className="text-lg text-brand-secondary max-w-3xl mx-auto">
            Explore the microscopic world of friction. Apply force to the block and observe how static friction builds up and transitions into kinetic friction.
          </p>
        </header>

        <main className="grid grid-cols-1 lg:grid-cols-5 gap-8">
          <div className="lg:col-span-3 flex flex-col gap-8">
            <div className="bg-white rounded-xl shadow-lg p-6 border border-gray-200">
              <h2 className="text-2xl font-semibold mb-4 text-center">Simulation View</h2>
              {/* FIX: The `maxStaticFriction` prop was removed from `SimulationCanvas` as it's not defined in its props and is not used within the component. */}
              <SimulationCanvas
                phase={simulation.phase}
                blockPosition={simulation.blockPosition}
                appliedForce={simulation.appliedForce}
                frictionForce={simulation.frictionForce}
                mass={simulation.mass}
              />
            </div>
             <div className="bg-white rounded-xl shadow-lg p-6 border border-gray-200">
               <h2 className="text-2xl font-semibold mb-4 text-center">Controls</h2>
               <ControlsPanel {...simulation} />
            </div>
          </div>

          <div className="lg:col-span-2 flex flex-col gap-8">
            <div className="bg-white rounded-xl shadow-lg p-6 border border-gray-200">
               <h2 className="text-2xl font-semibold mb-4 text-center">Friction Force vs. Applied Force</h2>
              <FrictionGraph
                data={simulation.graphData}
                maxStaticFriction={simulation.maxStaticFriction}
                kineticFriction={simulation.kineticFriction}
                maxAppliedForce={simulation.MAX_APPLIED_FORCE}
              />
            </div>
            <div className="bg-white rounded-xl shadow-lg p-6 border border-gray-200">
              <ExplanationPanel phase={simulation.phase} />
            </div>
          </div>
        </main>
        <footer className="text-center mt-12 text-sm text-gray-500">
            <p>Built with React, TypeScript, and Tailwind CSS. An educational tool to visualize physics concepts.</p>
        </footer>
      </div>
    </div>
  );
}

export default App;
