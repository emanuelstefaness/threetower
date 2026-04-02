"use client";

import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import * as THREE from "three";
import { memo, useEffect, useMemo, useRef, useState } from "react";
import type { BuildingSnapshot, FloorAggregate, RoomStatus } from "@/lib/buildingTypes";
import { STATUS_META, STATUS_ORDER } from "@/lib/status";

type Filters = {
  status: RoomStatus | "all";
  floor: number | "all";
  search: string;
};

type Props = {
  building: BuildingSnapshot | null;
  selectedFloor: number | null;
  onSelectFloor: (floor: number) => void;
  filters: Filters;
  onRequestCloseDrawer?: () => void;
};

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function hexToCss(hex: number) {
  return `#${hex.toString(16).padStart(6, "0")}`;
}

function computeSegments(counts: Record<RoomStatus, number>, total: number) {
  // Retorna [{status, ratio}] na ordem exigida
  const safeTotal = total <= 0 ? 1 : total;
  return STATUS_ORDER.map((s) => ({ status: s, ratio: counts[s] / safeTotal }));
}

function FloorGraphs({
  agg,
  opacity,
  glowBoost,
}: {
  agg: FloorAggregate;
  opacity: number;
  glowBoost: number;
}) {
  const thickness = 0.35;
  const width = 10;
  const depth = 4.2;

  const barHeight = 0.16;
  const barThickness = 0.045;
  const frontZ = depth / 2 + 0.001;
  const sideX = -width / 2 - 0.001;

  const widthAvailable = width - 1.2;
  const depthAvailable = depth - 0.9;

  const segments = computeSegments(agg.counts, agg.totalRooms);

  // Front (barra na face frontal, segmentos no eixo X)
  let xCursor = -widthAvailable / 2;
  const frontBars = segments.map(({ status, ratio }, idx) => {
    const len = idx === segments.length - 1 ? widthAvailable - (xCursor + widthAvailable / 2) : widthAvailable * ratio;
    const segCenterX = xCursor + len / 2;
    xCursor += len;

    const meta = STATUS_META[status];
    return (
      <mesh
        key={`front-${status}`}
        // Coord. local ao `FloorMesh` (o `FloorMesh` já posiciona o `group` em `y`)
        position={[segCenterX, thickness / 2 + barHeight / 2, frontZ]}
      >
        <boxGeometry args={[len, barHeight, barThickness]} />
        <meshPhysicalMaterial
          color={meta.color}
          emissive={meta.color}
          emissiveIntensity={0.25 * meta.glow * glowBoost}
          metalness={0.2}
          roughness={0.5}
          transparent
          opacity={opacity}
        />
      </mesh>
    );
  });

  // Side (barra na face lateral, segmentos no eixo Z)
  let zCursor = -depthAvailable / 2;
  const sideBars = segments.map(({ status, ratio }, idx) => {
    const len = idx === segments.length - 1 ? depthAvailable - (zCursor + depthAvailable / 2) : depthAvailable * ratio;
    const segCenterZ = zCursor + len / 2;
    zCursor += len;

    const meta = STATUS_META[status];
    return (
      <mesh
        key={`side-${status}`}
        position={[sideX, thickness / 2 + barHeight / 2, segCenterZ]}
      >
        <boxGeometry args={[barThickness, barHeight, len]} />
        <meshPhysicalMaterial
          color={meta.color}
          emissive={meta.color}
          emissiveIntensity={0.25 * meta.glow * glowBoost}
          metalness={0.2}
          roughness={0.5}
          transparent
          opacity={opacity}
        />
      </mesh>
    );
  });

  return (
    <>
      {frontBars}
      {sideBars}
    </>
  );
}

const FloorMesh = memo(function FloorMesh({
  floor,
  y,
  agg,
  isSelected,
  isHovered,
  opacity,
  glowBoost,
  onHover,
  onOut,
  onClick,
}: {
  floor: number;
  y: number;
  agg: FloorAggregate;
  isSelected: boolean;
  isHovered: boolean;
  opacity: number;
  glowBoost: number;
  onHover: (floor: number, clientX: number, clientY: number) => void;
  onOut: () => void;
  onClick: () => void;
}) {
  const thickness = 0.35;
  const width = 10;
  const depth = 4.2;

  const concreteColor = 0x0b1220;
  const glassOpacity = isHovered ? 0.62 : 0.45;

  return (
    <group position={[0, y, 0]}>
      <mesh
        onPointerOver={(e) => onHover(floor, e.nativeEvent.clientX, e.nativeEvent.clientY)}
        onPointerOut={onOut}
        onClick={onClick}
        position={[0, 0, 0]}
        renderOrder={isSelected ? 2 : 1}
      >
        <boxGeometry args={[width, thickness, depth]} />
        <meshPhysicalMaterial
          color={concreteColor}
          metalness={0.15}
          roughness={0.9}
          clearcoat={0.2}
          transparent
          opacity={opacity}
        />
      </mesh>

      {/* Top glass layer (glassmorphism) */}
      <mesh position={[0, thickness / 2 + 0.01, 0]}>
        <boxGeometry args={[width * 0.985, 0.06, depth * 0.985]} />
        <meshPhysicalMaterial
          color={0x60a5fa}
          metalness={0.2}
          roughness={0.35}
          transmission={0.55}
          ior={1.2}
          transparent
          opacity={glassOpacity * opacity}
          emissive={0x1d4ed8}
          emissiveIntensity={0.08 * glowBoost}
        />
      </mesh>

      <FloorGraphs agg={agg} opacity={opacity} glowBoost={glowBoost} />
    </group>
  );
});

function CameraController({
  selectedFloor,
  getFloorY,
  buildingCenterY,
}: {
  selectedFloor: number | null;
  getFloorY: (floor: number) => number;
  buildingCenterY: number;
}) {
  const { camera } = useThree();
  const controlsRef = useRef<any>(null);
  const basePos = useMemo(() => new THREE.Vector3(8, buildingCenterY + 3.1, 14), [buildingCenterY]);
  const baseTarget = useMemo(() => new THREE.Vector3(0, buildingCenterY, 0), [buildingCenterY]);

  useEffect(() => {
    // Posição/câmera conforme solicitado
    const width = 1; // aspect ajustado abaixo
    const height = 1;

    // `useThree().camera` vem tipado como `Camera` (genérico). Aqui a gente
    // assume o comportamento padrão do `Canvas` (PerspectiveCamera) e ajusta
    // as propriedades apenas se existirem em tempo de execução.
    if (camera instanceof THREE.PerspectiveCamera) {
      camera.fov = 50;
      camera.near = 0.1;
      camera.far = 1000;
    }
    camera.position.copy(basePos);
    camera.lookAt(baseTarget);
    camera.updateProjectionMatrix();
    void width;
    void height;
  }, [camera, basePos, baseTarget]);

  // Limita a rotação (azimuth) para um intervalo pequeno.
  useEffect(() => {
    const controls = controlsRef.current;
    if (!controls) return;

    // delta em radianos (~12 graus quando 0.22)
    const delta = 0.22;
    const initialAz = typeof controls.getAzimuthalAngle === "function" ? controls.getAzimuthalAngle() : 0;
    controls.minAzimuthAngle = initialAz - delta;
    controls.maxAzimuthAngle = initialAz + delta;
  }, []);

  useFrame(() => {
    // Focus zoom ao selecionar um andar
    const target = new THREE.Vector3(0, buildingCenterY, 0);
    const desiredPos = new THREE.Vector3().copy(basePos);
    if (selectedFloor != null) {
      const floorY = getFloorY(selectedFloor);
      target.set(0, floorY + 0.2, 0);
      desiredPos.set(6.2, floorY + 3.95, 10.2);
    }

    camera.position.lerp(desiredPos, 0.07);
    camera.lookAt(target);

    if (controlsRef.current) {
      const t = controlsRef.current.target as THREE.Vector3;
      if (t) t.lerp(target, 0.07);
    }
  });

  return (
    <OrbitControls
      ref={controlsRef}
      enableDamping
      dampingFactor={0.08}
      enablePan={false}
      enableZoom={false}
      minDistance={6}
      maxDistance={26}
      minPolarAngle={1.25}
      maxPolarAngle={1.45}
      rotateSpeed={0.6}
    />
  );
}

export function Building3D({ building, selectedFloor, onSelectFloor, filters }: Props) {
  const [hoveredFloor, setHoveredFloor] = useState<number | null>(null);
  const [tooltip, setTooltip] = useState<{ floor: number; x: number; y: number } | null>(null);

  const aggregated = building?.floorAggregates ?? null;

  // Altura entre andares (centro-a-centro). Para "prédio de verdade", os pisos
  // devem ficar colados, sem aquele vão grande entre camadas.
  // (A espessura do piso em `FloorMesh` é 0.35; aqui usamos o mesmo.)
  const baseHeight = 0.34;

  const floorY = (floor: number) => {
    return (floor - 1) * baseHeight;
  };

  const hoveredAgg = hoveredFloor != null && aggregated ? aggregated[hoveredFloor] : null;

  const dimsByFilter = (floor: number) => {
    if (filters.floor !== "all" && filters.floor !== floor) return 0.15;

    if (filters.status !== "all" && aggregated) {
      const agg = aggregated[floor];
      if (!agg) return 0.15;
      if (agg.counts[filters.status] === 0) return 0.12;
    }
    return 1;
  };

  const hoverOpacity = (floor: number) => {
    if (hoveredFloor != null) {
      if (floor === hoveredFloor) return 1;
      return 0.32;
    }
    return dimsByFilter(floor);
  };

  const glowBoost = hoveredFloor != null && hoveredFloor === (selectedFloor ?? hoveredFloor) ? 1.5 : 1.0;
  const buildingCenterY = aggregated ? ((Object.keys(aggregated).length - 1) * baseHeight) / 2 : 2.6;

  return (
    <div className="relative flex-1">
      <Canvas
        dpr={[1, 1.5]}
        shadows={false}
        gl={{ antialias: true, alpha: true }}
        camera={{ fov: 50, near: 0.1, far: 1000, position: [8, 10, 14] }}
      >
        <ambientLight intensity={0.55} />
        <directionalLight position={[10, 20, 10]} intensity={1.1} color={0x93c5fd} />
        <pointLight position={[-5, 8, 12]} intensity={0.7} color={0x60a5fa} />

        {aggregated &&
          STATUS_ORDER && // keep stable
          Object.keys(aggregated)
            .map((k) => Number(k))
            .sort((a, b) => a - b)
            .map((floor) => {
              const agg = aggregated[floor];
              if (!agg) return null;
              const isSelected = selectedFloor === floor;
              const isHovered = hoveredFloor === floor;
              const opacity = clamp(hoverOpacity(floor), 0.12, 1);
              const y = floorY(floor);

              return (
                <FloorMesh
                  key={`floor-${floor}`}
                  floor={floor}
                  y={y}
                  agg={agg}
                  isSelected={isSelected}
                  isHovered={isHovered}
                  opacity={opacity}
                  glowBoost={isHovered || isSelected ? 1.55 : 1.0}
                  onHover={(f, clientX, clientY) => {
                    setHoveredFloor(f);
                    setTooltip({ floor: f, x: clientX, y: clientY });
                  }}
                  onOut={() => {
                    setHoveredFloor(null);
                    setTooltip(null);
                  }}
                  onClick={() => onSelectFloor(floor)}
                />
              );
            })}

        <CameraController selectedFloor={selectedFloor} getFloorY={floorY} buildingCenterY={buildingCenterY} />
      </Canvas>

      {/* Tooltip 2D */}
      {tooltip && hoveredAgg && (
        <div
          className="pointer-events-none absolute z-20 min-w-[230px] rounded-xl border border-white/10 bg-slate-900/60 p-3 text-sm backdrop-blur-xl shadow-[0_0_40px_rgba(56,189,248,0.12)]"
          style={{
            left: tooltip.x + 12,
            top: tooltip.y + 12,
          }}
        >
          <div className="flex items-center gap-2 font-semibold text-slate-100">
            <span className="text-slate-300">Andar</span>
            <span className="text-slate-100">{hoveredAgg.floor}</span>
          </div>
          <div className="mt-1 text-slate-400">Total de salas: {hoveredAgg.totalRooms}</div>
          <div className="mt-2 flex h-2 w-full overflow-hidden rounded-full bg-white/5">
            {STATUS_ORDER.map((s) => {
              const ratio = hoveredAgg.counts[s] / Math.max(1, hoveredAgg.totalRooms);
              const w = Math.round(ratio * 1000) / 10;
              return (
                <div
                  key={`tip-${s}`}
                  style={{ width: `${w}%`, backgroundColor: hexToCss(STATUS_META[s].color) }}
                  className="h-full opacity-90"
                />
              );
            })}
          </div>
          <div className="mt-2 grid grid-cols-2 gap-1 text-slate-300">
            {STATUS_ORDER.map((s) => (
              <div key={`tip-k-${s}`} className="flex items-center justify-between gap-2">
                <span className="text-xs text-slate-400">{STATUS_META[s].emoji}</span>
                <span className="text-xs">{hoveredAgg.counts[s]}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

