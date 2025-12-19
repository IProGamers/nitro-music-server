import { createRoute, OpenAPIHono } from '@hono/zod-openapi'
import { HistoryModel } from '../models/history.model'
import { HistoryService } from '../services/history.service'
import { z } from 'zod'
import type { Routes } from '#common/types'

export class HistoryController implements Routes {
    public controller: OpenAPIHono
    private historyService: HistoryService

    constructor() {
        this.controller = new OpenAPIHono()
        this.historyService = new HistoryService()
    }

    public initRoutes() {
        this.controller.openapi(
            createRoute({
                method: 'get',
                path: '/history',
                tags: ['History'],
                summary: 'Retrieve playback history',
                description: 'Get the list of recently played songs.',
                operationId: 'getHistory',
                responses: {
                    200: {
                        description: 'Successful response with history',
                        content: {
                            'application/json': {
                                schema: z.object({
                                    success: z.boolean(),
                                    data: z.array(HistoryModel)
                                })
                            }
                        }
                    }
                }
            }),
            async (ctx) => {
                const history = await this.historyService.getHistory()
                // Prisma returns Date object for playedAt, we need to ensure it matches Zod schema (string)
                // We can map it or let JSON.stringify handle it (it produces ISO string)
                // But Zod might complain if we pass Date to z.string() validation?
                // Actually OpenAPIHono validates the response.
                // Let's map it to be safe.
                const mappedHistory = history.map(h => ({
                    ...h,
                    playedAt: h.playedAt.toISOString()
                }))
                return ctx.json({ success: true, data: mappedHistory })
            }
        )

        this.controller.openapi(
            createRoute({
                method: 'post',
                path: '/history',
                tags: ['History'],
                summary: 'Add to history',
                description: 'Add a song to playback history.',
                operationId: 'addToHistory',
                request: {
                    body: {
                        content: {
                            'application/json': {
                                schema: z.object({
                                    songId: z.string(),
                                    name: z.string(),
                                    artist: z.string(),
                                    image: z.string(),
                                    audioUrl: z.string()
                                })
                            }
                        }
                    }
                },
                responses: {
                    200: {
                        description: 'Successfully added to history',
                        content: {
                            'application/json': {
                                schema: z.object({
                                    success: z.boolean(),
                                    data: HistoryModel
                                })
                            }
                        }
                    }
                }
            }),
            async (ctx) => {
                const body = await ctx.req.json()
                const result = await this.historyService.addHistory(body)
                const mappedResult = {
                    ...result,
                    playedAt: result.playedAt.toISOString()
                }
                return ctx.json({ success: true, data: mappedResult })
            }
        )

        this.controller.openapi(
            createRoute({
                method: 'delete',
                path: '/history',
                tags: ['History'],
                summary: 'Clear history',
                description: 'Clear all playback history.',
                operationId: 'clearHistory',
                responses: {
                    200: {
                        description: 'Successfully cleared history',
                        content: {
                            'application/json': {
                                schema: z.object({
                                    success: z.boolean(),
                                    message: z.string()
                                })
                            }
                        }
                    }
                }
            }),
            async (ctx) => {
                await this.historyService.clearHistory()
                return ctx.json({ success: true, message: 'History cleared successfully' })
            }
        )
    }
}
