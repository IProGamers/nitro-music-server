import { createRoute, OpenAPIHono } from '@hono/zod-openapi'
import { FavoriteModel } from '../models/favorite.model'
import { FavoritesService } from '../services/favorites.service'
import { z } from 'zod'
import type { Routes } from '#common/types'

export class FavoritesController implements Routes {
    public controller: OpenAPIHono
    private favoritesService: FavoritesService

    constructor() {
        this.controller = new OpenAPIHono()
        this.favoritesService = new FavoritesService()
    }

    public initRoutes() {
        this.controller.openapi(
            createRoute({
                method: 'get',
                path: '/favorites',
                tags: ['Favorites'],
                summary: 'Retrieve favorites',
                description: 'Get the list of favorite songs.',
                operationId: 'getFavorites',
                responses: {
                    200: {
                        description: 'Successful response with favorites',
                        content: {
                            'application/json': {
                                schema: z.object({
                                    success: z.boolean(),
                                    data: z.array(FavoriteModel)
                                })
                            }
                        }
                    }
                }
            }),
            async (ctx) => {
                const favorites = await this.favoritesService.getFavorites()
                const mapped = favorites.map(f => ({
                    ...f,
                    addedAt: f.addedAt.toISOString()
                }))
                return ctx.json({ success: true, data: mapped })
            }
        )

        this.controller.openapi(
            createRoute({
                method: 'post',
                path: '/favorites',
                tags: ['Favorites'],
                summary: 'Add to favorites',
                description: 'Add a song to favorites.',
                operationId: 'addToFavorites',
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
                        description: 'Successfully added to favorites',
                        content: {
                            'application/json': {
                                schema: z.object({
                                    success: z.boolean(),
                                    data: FavoriteModel
                                })
                            }
                        }
                    }
                }
            }),
            async (ctx) => {
                const body = await ctx.req.json()
                const result = await this.favoritesService.addFavorite(body)
                const mapped = {
                    ...result,
                    addedAt: result.addedAt.toISOString()
                }
                return ctx.json({ success: true, data: mapped })
            }
        )

        this.controller.openapi(
            createRoute({
                method: 'delete',
                path: '/favorites/{id}',
                tags: ['Favorites'],
                summary: 'Remove from favorites',
                description: 'Remove a song from favorites.',
                operationId: 'removeFromFavorites',
                request: {
                    params: z.object({
                        id: z.string()
                    })
                },
                responses: {
                    200: {
                        description: 'Successfully removed from favorites',
                        content: {
                            'application/json': {
                                schema: z.object({
                                    success: z.boolean()
                                })
                            }
                        }
                    }
                }
            }),
            async (ctx) => {
                const id = ctx.req.param('id')
                await this.favoritesService.removeFavorite(id)
                return ctx.json({ success: true })
            }
        )

        this.controller.openapi(
            createRoute({
                method: 'get',
                path: '/favorites/{id}/check',
                tags: ['Favorites'],
                summary: 'Check if favorite',
                description: 'Check if a song is in favorites.',
                operationId: 'checkFavorite',
                request: {
                    params: z.object({
                        id: z.string()
                    })
                },
                responses: {
                    200: {
                        description: 'Check result',
                        content: {
                            'application/json': {
                                schema: z.object({
                                    success: z.boolean(),
                                    isFavorite: z.boolean()
                                })
                            }
                        }
                    }
                }
            }),
            async (ctx) => {
                const id = ctx.req.param('id')
                const isFavorite = await this.favoritesService.checkFavorite(id)
                return ctx.json({ success: true, isFavorite })
            }
        )
    }
}
