import { NextResponse } from 'next/server'
import pino from 'pino'

export async function GET() {
  try {
    // Create a pino logger with a transport
    // This internally uses thread-stream which creates worker_threads
    const logger = pino({
      transport: {
        target: 'pino/file',
        options: { destination: 1 }, // stdout
      },
    })

    // Log a test message - this triggers the transport worker
    logger.info('pino test message')

    // Flush the logger to ensure the message is sent
    // Use nextTick to allow async initialization of the transport
    await new Promise((resolve) => process.nextTick(resolve))

    return NextResponse.json({
      success: true,
      message: 'pino logger with transport initialized successfully',
    })
  } catch (error) {
    return NextResponse.json(
      { success: false, error: String(error) },
      { status: 500 }
    )
  }
}
