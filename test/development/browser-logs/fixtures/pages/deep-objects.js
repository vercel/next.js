export default function DeepObjectsPage() {
  return (
    <div>
      <button
        id="deep-button"
        onClick={() => {
          const deepObj = {
            level1: {
              level2: {
                level3: {
                  level4: {
                    level5: {
                      level6: {
                        level7: 'this should be cut off',
                      },
                    },
                  },
                },
              },
            },
          }
          console.log('Deep object:', deepObj)
        }}
      >
        Log Deep Object
      </button>
    </div>
  )
}
