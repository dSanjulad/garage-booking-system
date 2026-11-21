import React, { useId } from 'react';
import { motion } from 'framer-motion';
import { Bike, Bus, Car, CarFront, Truck } from 'lucide-react';
import { VEHICLES } from '../lib/format';

// lucide has no three-wheeler, so this one is drawn to match its stroke style.
const ThreeWheeler = ({ size = 18 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M4 15V9a4 4 0 0 1 4-4h6l4 6v4" />
    <path d="M14 5v6h4" />
    <path d="M8 15h7" />
    <circle cx="6" cy="17" r="2" />
    <circle cx="17" cy="17" r="2" />
  </svg>
);

const ICONS = { car: Car, suv: CarFront, van: Bus, motorcycle: Bike, three_wheeler: ThreeWheeler, lorry: Truck };

// Segmented control: one highlight glides between the vehicle types.
export default function VehiclePicker({ value, onChange, allowAny = false, available, onDark = false }) {
  const id = useId();
  const options = [
    ...(allowAny ? [{ value: '', label: 'Any vehicle' }] : []),
    ...VEHICLES.filter((v) => !available || available.includes(v.value))
  ];
  return (
    <div className={`vehicle-picker ${onDark ? 'vehicle-picker-dark' : ''}`} role="radiogroup" aria-label="Vehicle type">
      {options.map((v) => {
        const Icon = ICONS[v.value];
        const selected = value === v.value;
        return (
          <button key={v.value || 'any'} type="button" role="radio" aria-checked={selected} className={`vehicle-option ${selected ? 'is-on' : ''}`} onClick={() => onChange(v.value)}>
            {selected && <motion.span layoutId={`vehicle-${id}`} className="vehicle-highlight" transition={{ type: 'spring', stiffness: 500, damping: 38 }} />}
            <span className="vehicle-inner">{Icon && <Icon size={18} aria-hidden="true" />}{v.label}</span>
          </button>
        );
      })}
    </div>
  );
}
