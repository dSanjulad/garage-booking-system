import React from 'react';
import { Link } from 'react-router-dom';
import { SearchX } from 'lucide-react';
import { Empty } from '../components/ui';

export default function NotFound() {
  return (
    <div className="container page">
      <Empty icon={SearchX} title="This page doesn't exist">
        <p>The link may be old or mistyped.</p>
        <Link to="/" className="btn btn-primary">Find a garage</Link>
      </Empty>
    </div>
  );
}
