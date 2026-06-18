import { useEffect, useMemo } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useTableData } from '../lib/store';
import { getLearnerTerms } from '../utils/learnerTerminology';

const TEXT_ATTRIBUTES = ['aria-label', 'title', 'placeholder', 'alt'];
const SKIP_TAGS = new Set(['SCRIPT', 'STYLE', 'CODE', 'PRE', 'TEXTAREA']);

function replaceLearnerWords(value: string, plural: string, singular: string) {
  return value
    .replace(/\bStudents\b/g, plural)
    .replace(/\bstudents\b/g, plural.toLowerCase())
    .replace(/\bStudent\b/g, singular)
    .replace(/\bstudent\b/g, singular.toLowerCase());
}

function shouldSkipNode(node: Node) {
  const parent = node.parentElement;
  return !parent || SKIP_TAGS.has(parent.tagName);
}

function updateTextNode(node: Text, plural: string, singular: string) {
  const original = (node as any).__schofyOriginalText ?? node.nodeValue ?? '';
  if (!/\bstudents?\b/i.test(original)) return;
  (node as any).__schofyOriginalText = original;
  const next = replaceLearnerWords(original, plural, singular);
  if (node.nodeValue !== next) node.nodeValue = next;
}

function updateElementAttributes(element: Element, plural: string, singular: string) {
  for (const attr of TEXT_ATTRIBUTES) {
    const value = element.getAttribute(attr);
    if (!value || !/\bstudents?\b/i.test(value)) continue;
    const originalKey = `data-schofy-original-${attr}`;
    const original = element.getAttribute(originalKey) || value;
    const next = replaceLearnerWords(original, plural, singular);
    element.setAttribute(originalKey, original);
    if (value !== next) element.setAttribute(attr, next);
  }
}

function updateVisibleTerminology(root: ParentNode, plural: string, singular: string) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      if (shouldSkipNode(node)) return NodeFilter.FILTER_REJECT;
      return /\bstudents?\b/i.test(node.nodeValue || '') || /\bstudents?\b/i.test((node as any).__schofyOriginalText || '')
        ? NodeFilter.FILTER_ACCEPT
        : NodeFilter.FILTER_REJECT;
    },
  });

  const textNodes: Text[] = [];
  while (walker.nextNode()) textNodes.push(walker.currentNode as Text);
  textNodes.forEach(node => updateTextNode(node, plural, singular));

  document.querySelectorAll(TEXT_ATTRIBUTES.map(attr => `[${attr}]`).join(',')).forEach(element => {
    if (SKIP_TAGS.has(element.tagName)) return;
    updateElementAttributes(element, plural, singular);
  });
}

export function LearnerTerminologyAdapter() {
  const { user, schoolId } = useAuth();
  const sid = schoolId || user?.schoolId || user?.id || '';
  const { data: settingsRows } = useTableData(sid, 'settings');
  const schoolType = useMemo(() => {
    const row = settingsRows.find((setting: any) => setting.key === 'schoolType');
    return row?.value || 'secondary';
  }, [settingsRows]);
  const terms = useMemo(() => getLearnerTerms(schoolType), [schoolType]);

  useEffect(() => {
    if (typeof document === 'undefined') return;
    const apply = () => updateVisibleTerminology(document.body, terms.plural, terms.singular);
    apply();

    const observer = new MutationObserver((mutations) => {
      let shouldApply = false;
      for (const mutation of mutations) {
        if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
          shouldApply = true;
          break;
        }
        if (mutation.type === 'characterData' || mutation.type === 'attributes') {
          shouldApply = true;
          break;
        }
      }
      if (shouldApply) requestAnimationFrame(apply);
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true,
      attributes: true,
      attributeFilter: TEXT_ATTRIBUTES,
    });

    return () => observer.disconnect();
  }, [terms.plural, terms.singular]);

  return null;
}
