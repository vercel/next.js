// The app aliases this request to another file, so this file must never be evaluated.
throw new Error('my-blocked-pkg/redirected should not be evaluated')
