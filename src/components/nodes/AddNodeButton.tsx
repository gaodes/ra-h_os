"use client";

interface AddNodeButtonProps {
  onAddNode: () => void;
  loading?: boolean;
}

export default function AddNodeButton({ onAddNode, loading = false }: AddNodeButtonProps) {
  return (
    <button
      onClick={onAddNode}
      disabled={loading}
      style={{
        background: 'transparent',
        border: 'none',
        color: loading ? '#666' : '#fff',
        fontSize: '16px',
        padding: '6px',
        cursor: loading ? 'not-allowed' : 'pointer',
        borderRadius: '3px',
        transition: 'all 0.1s',
        fontFamily: 'inherit',
        width: '28px',
        height: '28px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center'
      }}
      onMouseEnter={(e) => {
        if (!loading) {
          e.currentTarget.style.background = '#1a1a1a';
        }
      }}
      onMouseLeave={(e) => {
        if (!loading) {
          e.currentTarget.style.background = 'transparent';
        }
      }}
    >
      {loading ? '...' : '+'}
    </button>
  );
}