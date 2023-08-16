import React from 'react'
import Image from 'next/image'

export default function Page() {
  return (
    <div style={{ position: 'absolute', width: '200px', height: '200px' }}>
      <p>Data Url With Fill And Sizes</p>
      <Image
        src="data:image/svg+xml;charset=utf-8,%3Csvg xmlns='http%3A//www.w3.org/2000/svg' %3E%3Cfilter id='b' color-interpolation-filters='sRGB'%3E%3CfeGaussianBlur stdDeviation='20'/%3E%3CfeComponentTransfer%3E%3CfeFuncA type='discrete' tableValues='1 1'/%3E%3C/feComponentTransfer%3E%%3C/filter%3E%3Cimage filter='url(%23b)' x='0' y='0' height='100%' width='100%' preserveAspectRatio='none' href='data:image/jpeg;base64,/9j/2wBDAAYEBQYFBAYGBQYHBwYIChAKCgkJChQODwwQFxQYGBcUFhYaHSUfGhsjHBYWICwgIyYnKSopGR8tMC0oMCUoKSj/2wBDAQcHBwoIChMKChMoGhYaKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCj/wAARCAAIAAgDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAL/xAAeEAABBAIDAQAAAAAAAAAAAAACAAEDBAUhBhRRsf/EABQBAQAAAAAAAAAAAAAAAAAAAAL/xAAWEQEBAQAAAAAAAAAAAAAAAAABAgD/2gAMAwEAAhEDEQA/ALPk+UoW6g46eca0oGFouu7NoNE3m/iIiZEmLbv/2Q=='/%3E%3C/svg%3E"
        alt="test"
        fill
        sizes="200px"
      />
    </div>
  )
}
