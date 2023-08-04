import { useCallback, useState, useEffect } from 'react'
import { useRouter } from 'next/router'
import { Analytics, logEvent, getAnalytics } from 'firebase/analytics'
import { useTranslation } from 'next-i18next'
import { useRecoilState } from 'recoil'
import { policyAgreedState } from '@/store/policy'
import Link from '@/components/routing/Link'
import Button from '@/components/common/atoms/Button'
import { firebaseApp } from '@/lib/firebase'

export default function AgreeToPolicy() {
  const [policyAgreed, setPolicyAgreed] = useRecoilState(policyAgreedState)
  const [open, setOpen] = useState(!policyAgreed)

  const [analytics, setAnalytics] = useState<Analytics | undefined>(undefined)

  const router = useRouter()
  const { t } = useTranslation()

  const handleAgree = useCallback(() => {
    setOpen(false)
    setPolicyAgreed(true)
  }, [setOpen, setPolicyAgreed])

  const handleClose = useCallback(() => {
    setOpen(false)
  }, [])

  useEffect(() => {
    if (policyAgreed) {
      if (firebaseApp && !analytics) {
        if (
          typeof window !== 'undefined' &&
          process.env.NODE_ENV !== 'development'
        ) {
          setAnalytics(getAnalytics(firebaseApp))
        }
      }
      if (firebaseApp && analytics) {
        logEvent(analytics, 'page_view', {
          page_title: document.title,
          page_location: document.URL,
          page_path: router.asPath,
        })
      }
    } else {
      setOpen(true)
    }
  }, [setOpen, policyAgreed, router.asPath, analytics])

  return (
    <>
      {open && (
        <div className="fixed bottom-4 left-4">
          <div className="h-96 w-64 bg-white shadow-lg dark:bg-black sm:h-72 sm:w-96">
            <div className="flex h-full flex-col justify-between p-6 sm:p-8">
              <div>
                <p className="text-lg font-bold text-gray-900 dark:text-white">
                  {t('AgreeToPolicy.title')}
                </p>
                <p className="mt-2 text-sm">{t('AgreeToPolicy.body')}</p>
                <Link
                  href="/legal/privacy-policy"
                  className="text-xs text-gray-700 underline hover:text-gray-900 dark:text-gray-50 dark:hover:text-gray-200"
                >
                  {t('privacy')}
                </Link>
              </div>
              <div className="flex flex-row justify-end space-x-2">
                <Button
                  className="text-xs"
                  variant="outline"
                  onClick={() => handleClose()}
                >
                  {t('AgreeToPolicy.no')}
                </Button>
                <Button className="text-xs" onClick={() => handleAgree()}>
                  {t('AgreeToPolicy.yes')}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
