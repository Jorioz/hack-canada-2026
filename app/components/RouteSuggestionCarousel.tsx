"use client";

import { useEffect, useCallback, useState } from "react";
import { SimulationCandidate } from "../types";

interface RouteSuggestionCarouselProps {
  candidates: SimulationCandidate[];
  currentIndex: number;
  onIndexChange: (index: number) => void;
  onSelect: (index: number) => void;
  onCancel: () => void;
}

export default function RouteSuggestionCarousel({
  candidates,
  currentIndex,
  onIndexChange,
  onSelect,
  onCancel,
}: RouteSuggestionCarouselProps) {
  const candidate = candidates[currentIndex];

  const handlePrev = useCallback(() => {
    onIndexChange(currentIndex > 0 ? currentIndex - 1 : candidates.length - 1);
  }, [currentIndex, candidates.length, onIndexChange]);

  const handleNext = useCallback(() => {
    onIndexChange(currentIndex < candidates.length - 1 ? currentIndex + 1 : 0);
  }, [currentIndex, candidates.length, onIndexChange]);

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft") handlePrev();
      else if (e.key === "ArrowRight") handleNext();
      else if (e.key === "Enter") onSelect(currentIndex);
      else if (e.key === "Escape") onCancel();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handlePrev, handleNext, currentIndex, onSelect, onCancel]);

  if (!candidate) return null;

  return (
    <div className="route-carousel">
      {/* Header */}
      <div className="route-carousel-header">
        <h3 className="route-carousel-title">AI Route Suggestions</h3>
        <span className="route-carousel-counter">
          {currentIndex + 1} / {candidates.length}
        </span>
      </div>

      {/* Route info */}
      <div className="route-carousel-body">
        <h4 className="route-carousel-name">{candidate.name}</h4>
        <p className="route-carousel-desc">{candidate.description}</p>

        {/* Neighbourhood tags */}
        {candidate.neighbourhoods && candidate.neighbourhoods.length > 0 && (
          <div className="route-carousel-tags">
            {candidate.neighbourhoods.map((n) => (
              <span key={n} className="route-carousel-tag">{n}</span>
            ))}
          </div>
        )}

        {/* Score and waypoints */}
        <div className="route-carousel-stats">
          <span className="route-carousel-score">
            Score: {Math.round(candidate.candidate_score)}
          </span>
          <span className="route-carousel-waypoints">
            {candidate.waypoint_count || candidate.path_lat_lng.length} waypoints
          </span>
        </div>
      </div>

      {/* Navigation */}
      <div className="route-carousel-nav">
        <button onClick={handlePrev} className="route-carousel-nav-btn">
          ← Prev
        </button>

        {/* Dots */}
        <div className="route-carousel-dots">
          {candidates.map((_, i) => (
            <button
              key={i}
              onClick={() => onIndexChange(i)}
              className={`route-carousel-dot ${i === currentIndex ? "active" : ""}`}
            />
          ))}
        </div>

        <button onClick={handleNext} className="route-carousel-nav-btn">
          Next →
        </button>

        <button onClick={() => onSelect(currentIndex)} className="route-carousel-select-btn">
          Select Route
        </button>
        <button onClick={onCancel} className="route-carousel-cancel-btn">
          Cancel
        </button>
      </div>

      <p className="route-carousel-hint">
        Use ← → arrow keys to browse • Enter to select • Esc to cancel
      </p>
    </div>
  );
}
