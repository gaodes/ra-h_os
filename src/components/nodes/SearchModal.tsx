"use client";

import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import Chip from '../common/Chip';

interface SearchModalProps {
  isOpen: boolean;
  onClose: () => void;
  onNodeSelect: (nodeId: number) => void;
  existingFilters: {type: 'dimension' | 'title', value: string}[];
}

interface NodeSuggestion {
  id: number;
  title: string;
  dimensions?: string[];
}

export default function SearchModal({ isOpen, onClose, onNodeSelect, existingFilters }: SearchModalProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [suggestions, setSuggestions] = useState<NodeSuggestion[]>([]);
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

  // Generate suggestions based on search query
  useEffect(() => {
    if (!searchQuery.trim()) {
      setSuggestions([]);
      return;
    }

    const fetchSuggestions = async () => {
      try {
        const response = await fetch(`/api/nodes/search?q=${encodeURIComponent(searchQuery)}&limit=10`);
        const result = await response.json();
        
        if (result.success) {
          const nodeSuggestions: NodeSuggestion[] = result.data.map((node: any) => ({
            id: node.id,
            title: node.title,
            dimensions: node.dimensions || []
          }));
          
          setSuggestions(nodeSuggestions);
          setSelectedIndex(0);
        }
      } catch (error) {
        console.error('Error fetching suggestions:', error);
        setSuggestions([]);
      }
    };

    const timeoutId = setTimeout(fetchSuggestions, 200);
    return () => clearTimeout(timeoutId);
  }, [searchQuery, existingFilters]);

  // Handle keyboard navigation
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex(prev => Math.min(prev + 1, suggestions.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex(prev => Math.max(prev - 1, 0));
    } else if (e.key === 'Enter' && suggestions[selectedIndex]) {
      e.preventDefault();
      handleSelectSuggestion(suggestions[selectedIndex]);
    }
  };

  const handleSelectSuggestion = (suggestion: NodeSuggestion) => {
    onNodeSelect(suggestion.id);
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
      aria-label="Search nodes"
    >
      <div
        ref={modalRef}
        style={{
          background: '#050505',
          border: '1px solid #1f1f1f',
          borderRadius: '12px',
          width: '90%',
          maxWidth: '600px',
          boxShadow: '0 25px 65px rgba(0, 0, 0, 0.7), 0 0 0 1px rgba(255, 255, 255, 0.05)',
          animation: 'slideIn 150ms ease-out'
        }}
      >
        {/* Search Input */}
        <div style={{
          padding: '16px',
          borderBottom: suggestions.length > 0 ? '1px solid #1f1f1f' : 'none'
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
            
            {/* Selected Filters */}
            {existingFilters.map((filter, index) => (
              <Chip
                key={index}
                label={filter.value}
                color={'#1a1a4d'}
                maxWidth={120}
              />
            ))}
            
            {/* Input */}
            <input
              ref={inputRef}
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={existingFilters.length === 0 ? "Search nodes..." : ""}
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
            {suggestions.map((suggestion, index) => {
              const primaryDimension = suggestion.dimensions && suggestion.dimensions.length > 0 
                ? suggestion.dimensions[0] 
                : '';
              
              return (
                <button
                  key={index}
                  onClick={() => handleSelectSuggestion(suggestion)}
                  onMouseEnter={() => setSelectedIndex(index)}
                  style={{
                    width: '100%',
                    padding: '12px 16px',
                    textAlign: 'left',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px',
                    fontSize: '13px',
                    background: index === selectedIndex ? '#252525' : 'transparent',
                    border: 'none',
                    borderBottom: index < suggestions.length - 1 ? '1px solid #1f1f1f' : 'none',
                    color: '#ccc',
                    cursor: 'pointer',
                    transition: 'background 0.1s',
                    fontFamily: 'inherit'
                  }}
                >
                  <span style={{
                    display: 'inline-block',
                    fontSize: '10px',
                    fontWeight: 700,
                    color: '#000',
                    background: '#22c55e',
                    padding: '2px 6px',
                    borderRadius: '6px',
                    minWidth: '20px',
                    textAlign: 'center',
                    letterSpacing: '0.05em',
                    flexShrink: 0
                  }}>
                    {suggestion.id}
                  </span>
                  {primaryDimension && (
                    <span style={{
                      color: '#666',
                      fontSize: '10px',
                      fontWeight: 600,
                      minWidth: '60px',
                      textTransform: 'uppercase',
                      letterSpacing: '0.05em'
                    }}>
                      {primaryDimension}
                    </span>
                  )}
                  <span style={{
                    flex: 1,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    color: '#e5e5e5'
                  }}>
                    {suggestion.title}
                  </span>
                </button>
              );
            })}
          </div>
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
