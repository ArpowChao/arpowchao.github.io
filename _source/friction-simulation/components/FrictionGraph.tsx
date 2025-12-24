
import React from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ReferenceLine } from 'recharts';
import { FrictionDataPoint } from '../types';

interface FrictionGraphProps {
  data: FrictionDataPoint[];
  maxStaticFriction: number;
  kineticFriction: number;
  maxAppliedForce: number;
}

export const FrictionGraph: React.FC<FrictionGraphProps> = ({ data, maxStaticFriction, kineticFriction, maxAppliedForce }) => {
  const yDomainMax = Math.max(100, Math.ceil(maxStaticFriction / 10) * 10 + 10);
  return (
    <div style={{ width: '100%', height: 300 }}>
      <ResponsiveContainer>
        <LineChart
          data={data}
          margin={{
            top: 5,
            right: 20,
            left: -10,
            bottom: 20,
          }}
        >
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis 
            dataKey="applied" 
            type="number" 
            domain={[0, maxAppliedForce]} 
            label={{ value: "Applied Force (N)", position: "insideBottom", offset: -15 }}
            />
          <YAxis 
            domain={[0, yDomainMax]}
            label={{ value: 'Friction Force (N)', angle: -90, position: 'insideLeft' }}
            />
          <Tooltip 
            formatter={(value: number, name: string) => [value.toFixed(1), name]}
            labelFormatter={(label: number) => `Applied: ${label.toFixed(1)} N`}
          />
          <Legend verticalAlign="top" />
          <Line 
            type="linear" 
            dataKey="friction" 
            stroke="#007BFF" 
            strokeWidth={3} 
            dot={false}
            name="Friction Force"
            isAnimationActive={false}
             />
          <ReferenceLine 
            y={maxStaticFriction} 
            label={{ value: "Max Static", position: "insideTopRight", fill: '#DC3545' }}
            stroke="#DC3545" 
            strokeDasharray="3 3" />
          <ReferenceLine 
            y={kineticFriction} 
            label={{ value: "Kinetic", position: "insideTopRight", fill: '#28A745' }}
            stroke="#28A745" 
            strokeDasharray="3 3" />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
};