"use client";

import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';

interface DimensionSearchModalProps {
  isOpen: boolean;
  onClose: () => void;
  onDimensionSelect: (dimension: string) => void;
  existingDimensions: string[];
}

interface DimensionSuggestion {
  dimension: string;
  count: number;
  isPriority: boolean;
}

export default function DimensionSearchModal({ 
  isOpen, 
  onClose, 
  onDimensionSelect,
  existingDimensions 
}: DimensionSearchModalProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [suggestions, setSuggestions] = useState<DimensionSuggestion[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const modalRef = useRef<HTMLDivElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);

  // Store the element that triggered the modal for return focus
  useEffect(() => {
    if (isOpen && document.activeElement instanceof HTMLElement) {
      returnFocusRef.current = document.activeElement;
    }
  }, [isOpen]);

  // Focus trap and accessibility
  useEffect(() => {
    if (!isOpen) return;

    // Autofocus input
    inputRef.current?.focus();

    // Lock body scroll
    document.body.style.overflow = 'hidden';

    // Handle Escape key
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };

    // Focus trap: keep focus within modal
    const handleTab = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return;
      
      const focusableElements = modalRef.current?.querySelectorAll(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      );
      
      if (!focusableElements || focusableElements.length === 0) return;
      
      const firstElement = focusableElements[0] as HTMLElement;
      const lastElement = focusableElements[focusableElements.length - 1] as HTMLElement;
      
      if (e.shiftKey) {
        if (document.activeElement === firstElement) {
          e.preventDefault();
          lastElement.focus();
        }
      } else {
        if (document.activeElement === lastElement) {
          e.preventDefault();
          firstElement.focus();
        }
      }
    };

    document.addEventListener('keydown', handleEscape);
    document.addEventListener('keydown', handleTab);

    return () => {
      document.body.style.overflow = '';
      document.removeEventListener('keydown', handleEscape);
      document.removeEventListener('keydown', handleTab);
      
      // Return focus to trigger element
      if (returnFocusRef.current) {
        returnFocusRef.current.focus();
      }
    };
  }, [isOpen, onClose]);

  // Fetch dimension suggestions
  useEffect(() => {
    const fetchSuggestions = async () => {
      try {
        const response = await fetch('/api/dimensions/popular?limit=50');
        const result = await response.json();
        
        if (result.success) {
          const allDimensions: DimensionSuggestion[] = result.data;
          
          // Filter based on search query and exclude existing dimensions
          const filtered = allDimensions.filter(dim => {
            const matchesQuery = !searchQuery.trim() || 
              dim.dimension.toLowerCase().includes(searchQuery.toLowerCase());
            const notExisting = !existingDimensions.includes(dim.dimension);
            return matchesQuery && notExisting;
          });
          
          // Sort: priority first, then by count
          const sorted = filtered.sort((a, b) => {
            if (a.isPriority && !b.isPriority) return -1;
            if (!a.isPriority && b.isPriority) return 1;
            return b.count - a.count;
          });
          
          setSuggestions(sorted.slice(0, 20));
          setSelectedIndex(0);
        }
      } catch (error) {
        console.error('Error fetching dimension suggestions:', error);
        setSuggestions([]);
      }
    };

    if (isOpen) {
      const timeoutId = setTimeout(fetchSuggestions, 100);
      return () => clearTimeout(timeoutId);
    }
  }, [searchQuery, existingDimensions, isOpen]);

  // Handle keyboard navigation
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex(prev => Math.min(prev + 1, suggestions.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex(prev => Math.max(prev - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      
      if (suggestions[selectedIndex]) {
        // Select existing dimension
        handleSelectDimension(suggestions[selectedIndex].dimension);
      } else if (searchQuery.trim()) {
        // Create new dimension
        handleSelectDimension(searchQuery.trim());
      }
    }
  };

  const handleSelectDimension = (dimension: string) => {
    onDimensionSelect(dimension);
    setSearchQuery('');
    setSuggestions([]);
    onClose();
  };

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  if (!isOpen) return null;

  const canCreateNew = searchQuery.trim() && 
    !suggestions.some(s => s.dimension.toLowerCase() === searchQuery.toLowerCase());

  const modalContent = (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: 'rgba(0, 0, 0, 0.8)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 9999,
        animation: 'fadeIn 150ms ease-out'
      }}
      onClick={handleBackdropClick}
      role="dialog"
      aria-modal="true"
      aria-label="Search dimensions"
    >
      <div
        ref={modalRef}
        style={{
          background: '#050505',
          border: '1px solid #1f1f1f',
          borderRadius: '12px',
          width: '90%',
          maxWidth: '500px',
          boxShadow: '0 25px 65px rgba(0, 0, 0, 0.7), 0 0 0 1px rgba(255, 255, 255, 0.05)',
          animation: 'slideIn 150ms ease-out'
        }}
      >
        {/* Search Input */}
        <div style={{
          padding: '16px',
          borderBottom: (suggestions.length > 0 || canCreateNew) ? '1px solid #1f1f1f' : 'none'
        }}>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            background: '#0a0a0a',
            padding: '12px',
            borderRadius: '6px',
            border: '1px solid #1f1f1f'
          }}>
            {/* Search Icon */}
            <svg width="16" height="16" viewBox="0 0 20 20" fill="#666">
              <path fillRule="evenodd" d="M9 3.5a5.5 5.5 0 100 11 5.5 5.5 0 000-11zM2 9a7 7 0 1112.452 4.391l3.328 3.329a.75.75 0 11-1.06 1.06l-3.329-3.328A7 7 0 012 9z" clipRule="evenodd" />
            </svg>
            
            {/* Input */}
            <input
              ref={inputRef}
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Search or create dimension..."
              style={{
                flex: 1,
                background: 'none',
                border: 'none',
                outline: 'none',
                color: '#fff',
                fontSize: '14px',
                fontFamily: 'inherit'
              }}
            />
            
            {/* Close Button */}
            <button
              onClick={onClose}
              style={{
                background: 'none',
                border: 'none',
                color: '#666',
                cursor: 'pointer',
                fontSize: '20px',
                padding: '0 4px',
                lineHeight: 1,
                transition: 'color 0.2s'
              }}
              onMouseEnter={(e) => { e.currentTarget.style.color = '#fff'; }}
              onMouseLeave={(e) => { e.currentTarget.style.color = '#666'; }}
              aria-label="Close search"
            >
              ×
            </button>
          </div>
        </div>

        {/* Suggestions */}
        {suggestions.length > 0 && (
          <div style={{
            maxHeight: '300px',
            overflowY: 'auto'
          }}>
            {suggestions.map((suggestion, index) => (
              <button
                key={suggestion.dimension}
                onClick={() => handleSelectDimension(suggestion.dimension)}
                onMouseEnter={() => setSelectedIndex(index)}
                style={{
                  width: '100%',
                  padding: '12px 16px',
                  textAlign: 'left',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  fontSize: '13px',
                  background: index === selectedIndex ? '#252525' : 'transparent',
                  border: 'none',
                  borderBottom: index < suggestions.length - 1 ? '1px solid #1f1f1f' : 'none',
                  color: '#e5e5e5',
                  cursor: 'pointer',
                  transition: 'background 0.1s',
                  fontFamily: 'inherit'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ 
                    color: suggestion.isPriority ? '#22c55e' : '#e5e5e5' 
                  }}>
                    {suggestion.dimension}
                  </span>
                </div>
                <span style={{ color: '#666', fontSize: '11px' }}>
                  {suggestion.count}
                </span>
              </button>
            ))}
          </div>
        )}

        {/* Create New Option */}
        {canCreateNew && (
          <button
            onClick={() => handleSelectDimension(searchQuery.trim())}
            style={{
              width: '100%',
              padding: '12px 16px',
              textAlign: 'left',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              fontSize: '13px',
              background: selectedIndex === suggestions.length ? '#252525' : 'transparent',
              border: 'none',
              borderTop: suggestions.length > 0 ? '1px solid #1f1f1f' : 'none',
              color: '#22c55e',
              cursor: 'pointer',
              transition: 'background 0.1s',
              fontFamily: 'inherit'
            }}
            onMouseEnter={() => setSelectedIndex(suggestions.length)}
          >
            <span style={{ fontSize: '16px', fontWeight: 300 }}>+</span>
            Create "{searchQuery.trim()}"
          </button>
        )}

        {/* Keyboard Hint */}
        <div style={{
          padding: '12px 16px',
          borderTop: '1px solid #1f1f1f',
          display: 'flex',
          justifyContent: 'flex-end',
          gap: '16px',
          fontSize: '11px',
          color: '#666'
        }}>
          <span>↑↓ Navigate</span>
          <span>↵ Select</span>
          <span>Esc Close</span>
        </div>
      </div>

      <style jsx>{`
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        
        @keyframes slideIn {
          from { 
            opacity: 0;
            transform: translateY(-20px);
          }
          to { 
            opacity: 1;
            transform: translateY(0);
          }
        }
      `}</style>
    </div>
  );

  return typeof window !== 'undefined' ? createPortal(modalContent, document.body) : null;
}
