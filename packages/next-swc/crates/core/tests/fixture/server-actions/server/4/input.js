'use server'
export async function a() {}
export async function b() {}
export async function c() {}

function d() {}

function Foo() {
  async function e() {
    'use server'
  }
}
