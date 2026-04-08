import { FileSystem } from '../resource/fs'
import { SystemStub } from '../platform/systemstub_web'

class Mp4CutscenePlayer {
    private _stub: SystemStub
    private _fs: FileSystem

    constructor(stub: SystemStub, fs: FileSystem) {
        this._stub = stub
        this._fs = fs
    }

    async play(videoPath: string): Promise<boolean> {
        const canvas = this._stub && this._stub._canvas
        if (!canvas) {
            throw new Error('Cannot play MPEG cutscene before the game canvas is initialized')
        }
        if (!document.body) {
            throw new Error('Cannot play MPEG cutscene without a document body')
        }

        const rect = canvas.getBoundingClientRect()
        const video = document.createElement('video')
        const resolvedVideoPath = this.resolveVideoPath(videoPath)
        video.src = resolvedVideoPath
        video.autoplay = true
        video.controls = false
        video.preload = 'auto'
        video.playsInline = true
        video.style.position = 'fixed'
        video.style.left = `${rect.left}px`
        video.style.top = `${rect.top}px`
        video.style.width = `${rect.width}px`
        video.style.height = `${rect.height}px`
        video.style.backgroundColor = '#000'
        video.style.objectFit = 'contain'
        video.style.zIndex = '1000'
        video.style.outline = 'none'

        const previousVisibility = canvas.style.visibility
        canvas.style.visibility = 'hidden'
        document.body.appendChild(video)

        return new Promise<boolean>((resolve, reject) => {
            let settled = false

            const cleanup = () => {
                if (video.parentNode) {
                    video.parentNode.removeChild(video)
                }
                canvas.style.visibility = previousVisibility
                video.removeEventListener('ended', onEnded)
                video.removeEventListener('error', onError)
            }

            const finish = (completed: boolean, error?: Error) => {
                if (settled) {
                    return
                }
                settled = true
                video.pause()
                cleanup()
                if (error) {
                    reject(error)
                } else {
                    resolve(completed)
                }
            }

            const onEnded = () => finish(true)

            const onError = () => {
                const mediaError = video.error
                const errorCode = mediaError ? mediaError.code : 0
                const errorMessage = mediaError ? this.describeMediaError(mediaError.code) : 'Unknown media error'
                console.error(`Mp4CutscenePlayer::onError src='${resolvedVideoPath}' code=${errorCode} message='${errorMessage}' networkState=${video.networkState} readyState=${video.readyState}`)
                finish(false, new Error(`Failed to play MPEG cutscene '${resolvedVideoPath}' (${errorMessage}, code=${errorCode})`))
            }
            video.addEventListener('ended', onEnded)
            video.addEventListener('error', onError)

            const playPromise = video.play()
            if (playPromise && typeof playPromise.catch === 'function') {
                playPromise.catch((error: Error) => {
                    const message = error && error.message ? error.message : String(error)
                    console.error(`Mp4CutscenePlayer::play() rejected src='${resolvedVideoPath}' message='${message}'`)
                    finish(false, new Error(`Failed to start MPEG cutscene '${resolvedVideoPath}': ${message}`))
                })
            }

            const pollInput = async () => {
                while (!settled) {
                    await this._stub.processEvents()
                    if (this._stub._pi.backspace || this._stub._pi.escape) {
                        console.log(`Mp4CutscenePlayer::play() interrupted by input backspace=${this._stub._pi.backspace} escape=${this._stub._pi.escape}`)
                        this._stub._pi.backspace = false
                        this._stub._pi.escape = false
                        finish(false)
                        return
                    }
                    await this._stub.sleep(16)
                }
            }

            pollInput().catch((error: Error) => {
                const message = error && error.message ? error.message : String(error)
                console.error(`Mp4CutscenePlayer::pollInput() failed src='${resolvedVideoPath}' message='${message}'`)
                finish(false, new Error(`Failed while monitoring MPEG cutscene input '${resolvedVideoPath}': ${message}`))
            })
        })
    }

    private resolveVideoPath(videoPath: string) {
        const candidates = this.buildPathCandidates(videoPath)

        for (let i = 0; i < candidates.length; ++i) {
            const resolved = this._fs && this._fs.findPath(candidates[i])
            if (resolved) {
                console.log(`Mp4CutscenePlayer::resolveVideoPath '${videoPath}' -> '${resolved}'`)
                return resolved
            }
        }

        throw new Error(`Could not resolve MPEG cutscene '${videoPath}' through FileSystem`)
    }

    private buildPathCandidates(videoPath: string) {
        const candidates = [videoPath]

        if (videoPath.indexOf('DATA/') === 0) {
            candidates.push(videoPath.slice(5))
        } else if (videoPath.indexOf('./DATA/') === 0) {
            candidates.push(videoPath.slice(7))
        }

        const extraCandidates: string[] = []
        for (let i = 0; i < candidates.length; ++i) {
            const candidate = candidates[i]
            if (/\.mpg$/i.test(candidate)) {
                extraCandidates.push(candidate.replace(/\.mpg$/i, '.mp4'))
            } else if (/\.mpeg$/i.test(candidate)) {
                extraCandidates.push(candidate.replace(/\.mpeg$/i, '.mp4'))
            }
        }

        for (let i = 0; i < extraCandidates.length; ++i) {
            if (candidates.indexOf(extraCandidates[i]) === -1) {
                candidates.push(extraCandidates[i])
            }
        }

        return candidates
    }

    private describeMediaError(code: number) {
        switch (code) {
            case 1:
                return 'MEDIA_ERR_ABORTED'
            case 2:
                return 'MEDIA_ERR_NETWORK'
            case 3:
                return 'MEDIA_ERR_DECODE'
            case 4:
                return 'MEDIA_ERR_SRC_NOT_SUPPORTED'
            default:
                return 'MEDIA_ERR_UNKNOWN'
        }
    }
}

export { Mp4CutscenePlayer }
