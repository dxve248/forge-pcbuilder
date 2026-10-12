// Compatibility rules + power estimation for a build.
//
// A build is a plain object keyed by category id, each value being a part
// object from parts.js or null when nothing is installed yet.

const BASE_BOARD_POWER = 40;   // chipset, VRM, onboard devices
const FAN_POWER = 3;           // per case fan
const RGB_OVERHEAD = 5;

/**
 * Estimated sustained system power draw in watts. Components that are not
 * installed contribute nothing.
 */
export function estimatePower(build) {
  let watts = 15; // baseline for fans, USB, misc
  if (build.motherboard) watts += BASE_BOARD_POWER;
  if (build.cpu) watts += build.cpu.power;
  if (build.cooler) watts += build.cooler.power;
  if (build.ram) watts += build.ram.power;
  if (build.gpu) watts += build.gpu.power;
  if (build.storage) watts += build.storage.power;
  if (build.case) watts += build.case.fans * FAN_POWER;
  watts += RGB_OVERHEAD;
  return Math.round(watts);
}

/**
 * Returns an array of check results. Each result:
 *   { level: 'ok' | 'warn' | 'info', label: string, detail: string }
 */
export function evaluateCompatibility(build) {
  const checks = [];
  const { cpu, motherboard: mb, ram, gpu, cooler, psu, case: pcCase } = build;

  // CPU <-> Motherboard socket
  if (cpu && mb) {
    if (cpu.socket === mb.socket) {
      checks.push(ok('CPU socket', `${cpu.socket} matches motherboard`));
    } else {
      checks.push(error('CPU socket', `${cpu.socket} CPU will not fit ${mb.socket} motherboard`));
    }
  }

  // RAM <-> Motherboard type
  if (ram && mb) {
    if (ram.ramType === mb.ramType) {
      checks.push(ok('Memory type', `${ram.ramType} supported by motherboard`));
    } else {
      checks.push(error('Memory type', `${ram.ramType} memory needs a ${ram.ramType} motherboard`));
    }
  }

  // Cooler <-> CPU socket support
  if (cooler && cpu) {
    if (cooler.sockets.includes(cpu.socket)) {
      checks.push(ok('Cooler mount', `Cooler supports ${cpu.socket}`));
    } else {
      checks.push(error('Cooler mount', `Cooler has no ${cpu.socket} mounting bracket`));
    }
  }

  // Motherboard <-> Case form factor
  if (mb && pcCase) {
    if (pcCase.formFactors.includes(mb.formFactor)) {
      checks.push(ok('Form factor', `${pcCase.name} fits ${mb.formFactor}`));
    } else {
      checks.push(error('Form factor', `${pcCase.name} does not fit a ${mb.formFactor} board`));
    }
  }

  // GPU length <-> Case clearance
  if (gpu && pcCase) {
    if (gpu.length <= pcCase.maxGpuLength) {
      checks.push(ok('GPU clearance', `${gpu.length}mm card fits ${pcCase.maxGpuLength}mm limit`));
    } else {
      checks.push(error('GPU clearance', `${gpu.length}mm card exceeds ${pcCase.maxGpuLength}mm limit`));
    }
  }

  // Cooler height / radiator <-> Case
  if (cooler && pcCase) {
    if (cooler.type === 'Air') {
      if (cooler.height <= pcCase.maxCoolerHeight) {
        checks.push(ok('Cooler clearance', `${cooler.height}mm cooler fits ${pcCase.maxCoolerHeight}mm limit`));
      } else {
        checks.push(error('Cooler clearance', `${cooler.height}mm cooler exceeds ${pcCase.maxCoolerHeight}mm limit`));
      }
    } else if (cooler.radiator > pcCase.maxRadiator) {
      checks.push(error('Radiator fit', `${cooler.radiator}mm radiator exceeds ${pcCase.maxRadiator}mm mount`));
    } else {
      checks.push(ok('Radiator fit', `${cooler.radiator}mm radiator supported`));
    }
  }

  // PSU wattage headroom
  if (psu) {
    const draw = estimatePower(build);
    const recommended = Math.ceil((draw * 1.3) / 50) * 50;
    if (psu.wattage < draw) {
      checks.push(error('Power supply', `${psu.wattage}W PSU is below the ${draw}W estimated draw`));
    } else if (psu.wattage < draw * 1.3) {
      checks.push(warn('Power supply', `${psu.wattage}W PSU leaves little headroom (${draw}W draw, ~${recommended}W advised)`));
    } else {
      checks.push(ok('Power supply', `${psu.wattage}W PSU has healthy headroom for ${draw}W`));
    }
  }

  // Storage <-> Motherboard M.2 slots
  if (build.storage && mb && build.storage.interface === 'NVMe' && mb.m2Slots < 1) {
    checks.push(error('Storage', 'Motherboard has no M.2 slot for this NVMe drive'));
  }

  if (checks.length === 0) {
    checks.push(info('Get started', 'Pick a case and components to begin your build'));
  }
  return checks;
}

const ok = (label, detail) => ({ level: 'ok', label, detail });
const warn = (label, detail) => ({ level: 'warn', label, detail });
const error = (label, detail) => ({ level: 'error', label, detail });
const info = (label, detail) => ({ level: 'info', label, detail });
