import { createRoute, OpenAPIHono } from '@hono/zod-openapi'
import { UserProfileModel } from '../models/profile.model'
import { ProfileService } from '../services/profile.service'
import { z } from 'zod'
import type { Routes } from '#common/types'

export class ProfileController implements Routes {
    public controller: OpenAPIHono
    private profileService: ProfileService

    constructor() {
        this.controller = new OpenAPIHono()
        this.profileService = new ProfileService()
    }

    public initRoutes() {
        this.controller.openapi(
            createRoute({
                method: 'get',
                path: '/profile',
                tags: ['Profile'],
                summary: 'Retrieve user profile',
                responses: {
                    200: {
                        description: 'Successful response',
                        content: {
                            'application/json': {
                                schema: z.object({
                                    success: z.boolean(),
                                    data: UserProfileModel
                                })
                            }
                        }
                    }
                }
            }),
            async (ctx) => {
                const profile = await this.profileService.getProfile()
                return ctx.json({ success: true, data: profile })
            }
        )

        this.controller.openapi(
            createRoute({
                method: 'patch',
                path: '/profile',
                tags: ['Profile'],
                summary: 'Update user profile',
                request: {
                    body: {
                        content: {
                            'application/json': {
                                schema: z.object({
                                    name: z.string().optional(),
                                    bio: z.string().optional(),
                                    image: z.string().nullable().optional()
                                })
                            }
                        }
                    }
                },
                responses: {
                    200: {
                        description: 'Updated profile',
                        content: {
                            'application/json': {
                                schema: z.object({
                                    success: z.boolean(),
                                    data: UserProfileModel
                                })
                            }
                        }
                    }
                }
            }),
            async (ctx) => {
                const body = await ctx.req.json()
                const profile = await this.profileService.updateProfile(body)
                return ctx.json({ success: true, data: profile })
            }
        )
        this.controller.openapi(
            createRoute({
                method: 'patch',
                path: '/profile/tier',
                tags: ['Profile'],
                summary: 'Update user tier',
                request: {
                    body: {
                        content: {
                            'application/json': {
                                schema: z.object({
                                    tier: z.enum(['NITRO_CORE', 'NITRO_ELITE', 'NITRO_SUPREME'])
                                })
                            }
                        }
                    }
                },
                responses: {
                    200: {
                        description: 'Updated tier',
                        content: {
                            'application/json': {
                                schema: z.object({
                                    success: z.boolean(),
                                    data: UserProfileModel
                                })
                            }
                        }
                    }
                }
            }),
            async (ctx) => {
                const body = await ctx.req.json()
                const profile = await this.profileService.updateTier(body.tier)
                return ctx.json({ success: true, data: profile })
            }
        )

        this.controller.openapi(
            createRoute({
                method: 'patch',
                path: '/profile/admin',
                tags: ['Profile'],
                summary: 'Update admin status',
                request: {
                    body: {
                        content: {
                            'application/json': {
                                schema: z.object({
                                    isAdmin: z.boolean()
                                })
                            }
                        }
                    }
                },
                responses: {
                    200: {
                        description: 'Updated admin status',
                        content: {
                            'application/json': {
                                schema: z.object({
                                    success: z.boolean(),
                                    data: UserProfileModel
                                })
                            }
                        }
                    }
                }
            }),
            async (ctx) => {
                const body = await ctx.req.json()
                const profile = await this.profileService.setAdmin(body.isAdmin)
                return ctx.json({ success: true, data: profile })
            }
        )
    }
}
