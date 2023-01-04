import React from 'react';
import { cookies, headers, previewData } from 'next/headers';

const HooksServer = () => {
  return (
    <div className="overflow-x-auto rounded-xl py-4 px-2 text-sm text-white [color-scheme:dark]">
      <pre>
        {JSON.stringify(
          {
            cookies: cookies(),
            useHeaders: headers(),
            usePreviewData: previewData(),
          },
          null,
          2,
        )}
      </pre>
    </div>
  );
};

export default HooksServer;
