import React, { useState, useEffect } from 'react';

interface LiveEditableProps {
  value: string;
  onSave: (v: string) => void;
  isLiveEditing: boolean;
  className?: string;
  style?: React.CSSProperties;
}

const LiveEditable: React.FC<LiveEditableProps> = ({ 
  value, 
  onSave, 
  isLiveEditing,
  className = "",
  style
}) => {
  const [isInternalEditing, setIsInternalEditing] = useState(false);
  const [temp, setTemp] = useState(value);

  useEffect(() => {
    setTemp(value);
  }, [value]);

  if (isLiveEditing && isInternalEditing) {
    return (
      <input 
        autoFocus
        value={temp} 
        onChange={e => setTemp(e.target.value)}
        onBlur={() => { 
          setIsInternalEditing(false); 
          if (temp !== value) onSave(temp); 
        }}
        onKeyDown={e => {
          if (e.key === 'Enter') {
            setIsInternalEditing(false);
            if (temp !== value) onSave(temp);
          }
        }}
        className={`bg-white dark:bg-slate-800 border-2 border-indigo-500 rounded outline-none px-1 text-slate-900 dark:text-white ${className}`}
        style={{ ...style, width: `${Math.max(value.length, temp.length, 5)}ch` }}
      />
    );
  }

  return (
    <span 
      onClick={() => isLiveEditing && setIsInternalEditing(true)} 
      className={`
        transition-all duration-200
        ${isLiveEditing ? 'cursor-pointer hover:bg-yellow-100/50 dark:hover:bg-yellow-900/20 ring-1 ring-transparent hover:ring-yellow-400/50 rounded px-1' : ''}
        ${className}
      `}
      style={style}
    >
      {value}
    </span>
  );
};

export default LiveEditable;
