"use client";

import { useState } from 'react';
import { Video, FileText, File, Globe } from 'lucide-react';
import { Node } from '@/types/database';

interface FaviconIconProps {
  domain: string;
}

const FaviconIcon = ({ domain }: FaviconIconProps) => {
  const [failed, setFailed] = useState(false);
  
  if (failed) {
    return <Globe size={16} color="#94a3b8" />;
  }
  
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={`https://www.google.com/s2/favicons?domain=${domain}&sz=16`}
      width={16}
      height={16}
      alt=""
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
    />
  );
};

export function getNodeIcon(node: Node): React.ReactElement {
  // No link - show generic file icon
  if (!node.link) {
    return <File size={16} color="#94a3b8" />;
  }
  
  const url = node.link.toLowerCase();
  
  // YouTube videos
  if (url.includes('youtube.com') || url.includes('youtu.be')) {
    return <Video size={16} color="#FF0000" />;
  }
  
  // PDFs and papers
  if (url.endsWith('.pdf') || node.metadata?.type === 'paper') {
    return <FileText size={16} color="#94a3b8" />;
  }
  
  // Website favicon with graceful fallback
  try {
    const domain = new URL(node.link).hostname;
    return <FaviconIcon domain={domain} />;
  } catch {
    return <Globe size={16} color="#94a3b8" />;
  }
}
