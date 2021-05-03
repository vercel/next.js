import React from 'react'
import Image from 'next/image'

export default function Page() {
  return (
    <div>
      <p>Blurry Placeholder</p>
      <Image
        priority
        id="blurry-placeholder"
        src="/test.jpg"
        width="400"
        height="400"
        placeholder="blur"
        blurDataURL="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='400' height='400' viewBox='0 0 400 400'%3E%3Cfilter id='blur' filterUnits='userSpaceOnUse' color-interpolation-filters='sRGB'%3E%3CfeGaussianBlur stdDeviation='20' edgeMode='duplicate' /%3E%3CfeComponentTransfer%3E%3CfeFuncA type='discrete' tableValues='1 1' /%3E%3C/feComponentTransfer%3E%3C/filter%3E%3Cimage filter='url(%23blur)' href='data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAMDAwMDAwQEBAQFBQUFBQcHBgYHBwsICQgJCAsRCwwLCwwLEQ8SDw4PEg8bFRMTFRsfGhkaHyYiIiYwLTA+PlT/wAALCAAKAAoBAREA/8QAMwABAQEAAAAAAAAAAAAAAAAAAAcJEAABAwUAAwAAAAAAAAAAAAAFAAYRAQMEEyEVMlH/2gAIAQEAAD8Az1bLPaxhiuk0QdeCOLDtHixN2dmd2bsc5FPX7VTREX//2Q==' x='0' y='0' height='100%25' width='100%25'/%3E%3C/svg%3E"
      />
    </div>
  )
}
