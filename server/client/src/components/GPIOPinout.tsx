import React, { useState } from 'react';
import type { PinData } from '../types';
import './GPIOPinout.css';

interface GPIOPinoutProps {
  moduleType: string;
}

export const GPIOPinout: React.FC<GPIOPinoutProps> = ({ moduleType }) => {
  const [currentView, setCurrentView] = useState<'bottom' | 'top'>('bottom');

  if (moduleType !== 'ESP8266') {
    return <div className="gpio-placeholder">GPIO pinout not available for this module type</div>;
  }

  const leftPins: PinData[] = [
    { label: 'D0', gpio: 'GPIO16', notes: 'Wake from deep sleep / LED_BUILTIN (no PWM/I²C/interrupts)', type: 'gpio' },
    { label: 'D1', gpio: 'GPIO5', notes: 'SCL (I²C)', type: 'gpio' },
    { label: 'D2', gpio: 'GPIO4', notes: 'SDA (I²C)', type: 'gpio' },
    { label: 'D3', gpio: 'GPIO0', notes: '⚠️ Boot mode (pulled high, must be HIGH at boot)', type: 'gpio' },
    { label: 'D4', gpio: 'GPIO2', notes: '⚠️ Onboard LED (active LOW) — must be HIGH at boot', type: 'gpio' },
    { label: '3V3', gpio: '—', notes: '3.3V regulated output', type: 'power' },
    { label: 'GND', gpio: '—', notes: 'Ground', type: 'ground' },
    { label: 'D5', gpio: 'GPIO14', notes: 'SPI CLK', type: 'gpio' },
    { label: 'D6', gpio: 'GPIO12', notes: 'SPI MISO', type: 'gpio' },
    { label: 'D7', gpio: 'GPIO13', notes: 'SPI MOSI', type: 'gpio' },
    { label: 'D8', gpio: 'GPIO15', notes: '⚠️ SPI SS (pulled low, must be LOW at boot)', type: 'gpio' },
    { label: 'RX', gpio: 'GPIO3', notes: 'UART RX0 (D9)', type: 'gpio' },
    { label: 'TX', gpio: 'GPIO1', notes: 'UART TX0 (D10)', type: 'gpio' },
    { label: 'GND', gpio: '—', notes: 'Ground', type: 'ground' },
    { label: 'VIN', gpio: '—', notes: '5V input (from USB)', type: 'power' }
  ];

  const rightPins: PinData[] = [
    { label: 'A0', gpio: 'ADC', notes: '10-bit ADC (0-3.3V max)', type: 'gpio' },
    { label: 'RST', gpio: '—', notes: 'Reset (active low)', type: 'power' },
    { label: 'RSV', gpio: '—', notes: 'Reserved', type: 'power' },
    { label: 'RSV', gpio: '—', notes: 'Reserved', type: 'power' },
    { label: 'SD3', gpio: 'GPIO10', notes: 'Flash SPI (SD3)', type: 'gpio' },
    { label: 'SD2', gpio: 'GPIO9', notes: 'Flash SPI (SD2)', type: 'gpio' },
    { label: 'SD1', gpio: 'GPIO8', notes: 'Flash SPI (SD1)', type: 'gpio' },
    { label: 'CMD', gpio: 'GPIO11', notes: 'Flash SPI (CMD)', type: 'gpio' },
    { label: 'SD0', gpio: 'GPIO7', notes: 'Flash SPI (SD0)', type: 'gpio' },
    { label: 'CLK', gpio: 'GPIO6', notes: 'Flash SPI (CLK)', type: 'gpio' },
    { label: 'GND', gpio: '—', notes: 'Ground', type: 'ground' },
    { label: '3V3', gpio: '—', notes: '3.3V regulated output', type: 'power' },
    { label: 'EN', gpio: '—', notes: 'Enable (CH_PD)', type: 'power' },
    { label: 'RST', gpio: '—', notes: 'Reset (active low)', type: 'power' },
    { label: 'GND', gpio: '—', notes: 'Ground', type: 'ground' }
  ];

  let leftDisplay = leftPins;
  let rightDisplay = rightPins;

  if (currentView === 'top') {
    leftDisplay = rightPins;
    rightDisplay = leftPins;
  }

  const renderPinRow = (pin: PinData, index: number, side: 'left' | 'right') => {
    const pinNumber = side === 'left' ? index + 1 : index + 16;
    
    if (side === 'left') {
      return (
        <div key={index} className={`gpio-pin-row ${pin.type}`}>
          <div className="gpio-pin-number">{pinNumber}</div>
          <div className="gpio-pin-hole"></div>
          <div className="gpio-pin-content">
            <div className="gpio-pin-line1">
              <span className="gpio-pin-label">{pin.label}</span>
              <span className="gpio-pin-gpio">{pin.gpio}</span>
            </div>
            <div className="gpio-pin-line2">
              <span className="gpio-pin-notes">{pin.notes}</span>
            </div>
          </div>
        </div>
      );
    } else {
      return (
        <div key={index} className={`gpio-pin-row ${pin.type}`}>
          <div className="gpio-pin-content">
            <div className="gpio-pin-line1">
              <span className="gpio-pin-gpio">{pin.gpio}</span>
              <span className="gpio-pin-label">{pin.label}</span>
            </div>
            <div className="gpio-pin-line2">
              <span className="gpio-pin-notes">{pin.notes}</span>
            </div>
          </div>
          <div className="gpio-pin-hole"></div>
          <div className="gpio-pin-number">{pinNumber}</div>
        </div>
      );
    }
  };

  return (
    <div className="gpio-pinout-schematic">
      <div className="gpio-view-controls">
        <button 
          className={currentView === 'bottom' ? 'active' : ''}
          onClick={() => setCurrentView('bottom')}
        >
          Bottom View
        </button>
        <button 
          className={currentView === 'top' ? 'active' : ''}
          onClick={() => setCurrentView('top')}
        >
          Top View
        </button>
      </div>
      
      <div className="gpio-board">
        <div className="gpio-board-title">
          NodeMCU v2 — {currentView === 'bottom' ? 'BOTTOM VIEW' : 'TOP VIEW'}
        </div>
        <div className="gpio-pins-container">
          <div className="gpio-pin-side left">
            {leftDisplay.map((pin, idx) => renderPinRow(pin, idx, 'left'))}
          </div>
          <div className="gpio-pin-side right">
            {rightDisplay.map((pin, idx) => renderPinRow(pin, idx, 'right'))}
          </div>
        </div>
        <div className="gpio-usb-port">⬜ USB PORT (BOTTOM)</div>
      </div>
      
      <div className="gpio-warning-note">
        <strong>⚠️ Boot Requirements:</strong> D3 (GPIO0) must be HIGH, D4 (GPIO2) must be HIGH, D8 (GPIO15) must be LOW at boot.<br />
        <strong>💡 Onboard LED:</strong> GPIO2 (D4) — active LOW on most NodeMCU boards.<br />
        <strong>⚡ Voltage:</strong> All GPIO are 3.3V — do NOT connect 5V signals directly.
      </div>
    </div>
  );
};
